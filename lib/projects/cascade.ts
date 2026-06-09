import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { addDays } from "@/lib/gantt/date";

/**
 * Shift all downstream dependents of a task by `deltaDays`.
 *
 * Used for "auto-shift dependents": when a task's dates move, every task that
 * (transitively) depends on it slides by the same delta so the plan stays
 * consistent.
 *
 * Concurrency: this is a server-authoritative cascade triggered by an explicit
 * user action, so we do NOT require expectedLockVersion on the downstream
 * rows — we just bump their lockVersion (any client holding a stale value will
 * then correctly get a 409 on its next edit). neon-http has no transactions,
 * so updates are sequential; a mid-cascade failure leaves a partial shift the
 * user can re-trigger, but never silently overwrites unrelated fields (only
 * start/end move).
 */
export async function shiftDownstream(opts: {
  projectId: string;
  taskId: string;
  actorId: string;
  deltaDays: number;
}): Promise<{ shifted: number }> {
  if (opts.deltaDays === 0) return { shifted: 0 };

  // Load all dependency edges in the project (both endpoints active).
  const activeIds = (
    await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, opts.projectId),
          isNull(schema.tasks.deletedAt)
        )
      )
  ).map((r) => r.id);
  const activeSet = new Set(activeIds);

  const edges = await db
    .select({
      from: schema.taskDependencies.fromTaskId,
      to: schema.taskDependencies.toTaskId,
    })
    .from(schema.taskDependencies)
    .where(
      and(
        inArray(schema.taskDependencies.fromTaskId, activeIds),
        inArray(schema.taskDependencies.toTaskId, activeIds)
      )
    );

  // Adjacency: from → [to].
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.from) ?? [];
    arr.push(e.to);
    adj.set(e.from, arr);
  }

  // BFS downstream from the source (exclude the source itself).
  const downstream = new Set<string>();
  const queue = [...(adj.get(opts.taskId) ?? [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (downstream.has(cur) || !activeSet.has(cur)) continue;
    downstream.add(cur);
    for (const nxt of adj.get(cur) ?? []) {
      if (!downstream.has(nxt)) queue.push(nxt);
    }
  }
  downstream.delete(opts.taskId);
  if (downstream.size === 0) return { shifted: 0 };

  // Load + shift each downstream task's dates.
  const rows = await db
    .select({
      id: schema.tasks.id,
      startAt: schema.tasks.startAt,
      endAt: schema.tasks.endAt,
    })
    .from(schema.tasks)
    .where(inArray(schema.tasks.id, Array.from(downstream)));

  let shifted = 0;
  for (const r of rows) {
    const newStart = r.startAt ? addDays(r.startAt, opts.deltaDays) : null;
    const newEnd = r.endAt ? addDays(r.endAt, opts.deltaDays) : null;
    if (newStart === null && newEnd === null) continue;
    await db
      .update(schema.tasks)
      .set({
        startAt: newStart,
        endAt: newEnd,
        updatedAt: new Date(),
        lockVersion: sql`${schema.tasks.lockVersion} + 1`,
      })
      .where(eq(schema.tasks.id, r.id));
    shifted++;
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.cascade_shift",
    targetType: "task",
    targetId: opts.taskId,
    after: { deltaDays: opts.deltaDays, shifted },
  });

  return { shifted };
}
