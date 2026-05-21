import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { addDays } from "@/lib/gantt/date";

export type RecurInterval = "week" | "month";

/** Add `n` intervals to a date (calendar month for "month"). */
function shift(date: Date, interval: RecurInterval, n: number): Date {
  if (interval === "week") return addDays(date, 7 * n);
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Create `count` recurring copies of a task, each shifted forward by the
 * interval. Copies share title/type/status but get fresh ids and dense
 * positions appended to the end. No cron — this is one-shot generation.
 */
export async function repeatTask(opts: {
  projectId: string;
  taskId: string;
  actorId: string;
  interval: RecurInterval;
  count: number;
}): Promise<{ created: number }> {
  const [src] = await db
    .select({
      title: schema.tasks.title,
      status: schema.tasks.status,
      type: schema.tasks.type,
      startAt: schema.tasks.startAt,
      endAt: schema.tasks.endAt,
      visibility: schema.tasks.visibility,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, opts.taskId),
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .limit(1);
  if (!src) throw new Error("Task not found");

  const n = Math.max(1, Math.min(52, opts.count));
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      projectId: opts.projectId,
      title: src.title,
      status: src.status,
      type: src.type,
      startAt: src.startAt ? shift(src.startAt, opts.interval, i) : null,
      endAt: src.endAt ? shift(src.endAt, opts.interval, i) : null,
      visibility: src.visibility,
      position: Number(maxPos) + i,
      createdBy: opts.actorId,
    });
  }
  await db.insert(schema.tasks).values(rows);

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.repeat",
    targetType: "task",
    targetId: opts.taskId,
    after: { interval: opts.interval, count: n },
  });

  return { created: n };
}
