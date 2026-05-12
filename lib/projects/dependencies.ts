import "server-only";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type Dependency = { fromTaskId: string; toTaskId: string };

/** All dependency edges where both endpoints belong to the project (and are active). */
export async function listProjectDependencies(projectId: string): Promise<Dependency[]> {
  // Fetch all active task ids for the project (skip soft-deleted), then fetch
  // deps where both endpoints are in the set. Dependencies pointing to a
  // soft-deleted task are filtered out implicitly.
  const tasks = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, projectId),
        isNull(schema.tasks.deletedAt)
      )
    );
  const ids = tasks.map((t) => t.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.taskDependencies)
    .where(
      and(
        inArray(schema.taskDependencies.fromTaskId, ids),
        inArray(schema.taskDependencies.toTaskId, ids)
      )
    );
  return rows.map((r) => ({ fromTaskId: r.fromTaskId, toTaskId: r.toTaskId }));
}

/** True if adding (from -> to) would create a cycle. */
async function wouldCycle(fromTaskId: string, toTaskId: string): Promise<boolean> {
  if (fromTaskId === toTaskId) return true;
  // BFS from `to` following dependencies; if we reach `from`, cycle.
  const seen = new Set<string>([toTaskId]);
  const queue: string[] = [toTaskId];
  while (queue.length) {
    const cur = queue.shift()!;
    const out = await db
      .select({ to: schema.taskDependencies.toTaskId })
      .from(schema.taskDependencies)
      .where(eq(schema.taskDependencies.fromTaskId, cur));
    for (const o of out) {
      if (o.to === fromTaskId) return true;
      if (!seen.has(o.to)) {
        seen.add(o.to);
        queue.push(o.to);
      }
    }
  }
  return false;
}

export async function addDependency(opts: {
  projectId: string;
  fromTaskId: string;
  toTaskId: string;
  actorId: string;
}): Promise<{ added: boolean; reason?: string }> {
  // Confirm both tasks belong to the project AND are active (not soft-deleted).
  const tasks = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        inArray(schema.tasks.id, [opts.fromTaskId, opts.toTaskId]),
        isNull(schema.tasks.deletedAt)
      )
    );
  if (tasks.length !== 2) return { added: false, reason: "Tasks not in this project" };

  if (await wouldCycle(opts.fromTaskId, opts.toTaskId)) {
    return { added: false, reason: "Would create a cycle" };
  }

  // Idempotent — composite PK prevents dupes.
  const existing = await db
    .select({ from: schema.taskDependencies.fromTaskId })
    .from(schema.taskDependencies)
    .where(
      and(
        eq(schema.taskDependencies.fromTaskId, opts.fromTaskId),
        eq(schema.taskDependencies.toTaskId, opts.toTaskId)
      )
    )
    .limit(1);
  if (existing.length > 0) return { added: true };

  await db
    .insert(schema.taskDependencies)
    .values({ fromTaskId: opts.fromTaskId, toTaskId: opts.toTaskId });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.dependency.add",
    targetType: "task",
    targetId: opts.toTaskId,
    after: { from: opts.fromTaskId, to: opts.toTaskId },
  });

  return { added: true };
}

export async function removeDependency(opts: {
  projectId: string;
  fromTaskId: string;
  toTaskId: string;
  actorId: string;
}): Promise<void> {
  await db
    .delete(schema.taskDependencies)
    .where(
      and(
        eq(schema.taskDependencies.fromTaskId, opts.fromTaskId),
        eq(schema.taskDependencies.toTaskId, opts.toTaskId)
      )
    );
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.dependency.remove",
    targetType: "task",
    targetId: opts.toTaskId,
    before: { from: opts.fromTaskId, to: opts.toTaskId },
  });
}

// Critical-path computation lives in `@/lib/gantt/critical-path` so it can be
// imported from Client Components too.
