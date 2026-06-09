import "server-only";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type BaselineRow = {
  id: string;
  name: string;
  createdAt: Date;
};

export type BaselineTaskRow = {
  taskId: string;
  title: string;
  startAt: Date | null;
  endAt: Date | null;
};

export async function listProjectBaselines(
  projectId: string
): Promise<BaselineRow[]> {
  return db
    .select({
      id: schema.baselines.id,
      name: schema.baselines.name,
      createdAt: schema.baselines.createdAt,
    })
    .from(schema.baselines)
    .where(eq(schema.baselines.projectId, projectId))
    .orderBy(desc(schema.baselines.createdAt));
}

/**
 * Snapshot all active tasks' planned start/end into a new baseline.
 *
 * Two statements (insert baseline, then insert snapshot rows) — no
 * transaction because the project uses Neon's HTTP driver. The window
 * between them is tiny and a failure on the second leaves an empty baseline
 * the user can simply delete, so we accept the lack of atomicity.
 */
export async function createBaseline(opts: {
  projectId: string;
  actorId: string;
  name: string;
}): Promise<{ id: string; taskCount: number }> {
  const [baseline] = await db
    .insert(schema.baselines)
    .values({
      projectId: opts.projectId,
      name: opts.name,
      createdBy: opts.actorId,
    })
    .returning({ id: schema.baselines.id });

  const activeTasks = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      startAt: schema.tasks.startAt,
      endAt: schema.tasks.endAt,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  if (activeTasks.length > 0) {
    await db.insert(schema.baselineTasks).values(
      activeTasks.map((t) => ({
        baselineId: baseline.id,
        taskId: t.id,
        title: t.title,
        startAt: t.startAt,
        endAt: t.endAt,
      }))
    );
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "baseline.create",
    targetType: "baseline",
    targetId: baseline.id,
    after: { name: opts.name, taskCount: activeTasks.length },
  });

  return { id: baseline.id, taskCount: activeTasks.length };
}

/** Snapshot rows for a baseline (verifying it belongs to the project). */
export async function getBaselineTasks(
  projectId: string,
  baselineId: string
): Promise<BaselineTaskRow[] | null> {
  const [b] = await db
    .select({ id: schema.baselines.id })
    .from(schema.baselines)
    .where(
      and(
        eq(schema.baselines.id, baselineId),
        eq(schema.baselines.projectId, projectId)
      )
    )
    .limit(1);
  if (!b) return null;

  return db
    .select({
      taskId: schema.baselineTasks.taskId,
      title: schema.baselineTasks.title,
      startAt: schema.baselineTasks.startAt,
      endAt: schema.baselineTasks.endAt,
    })
    .from(schema.baselineTasks)
    .where(eq(schema.baselineTasks.baselineId, baselineId));
}

export async function deleteBaseline(opts: {
  projectId: string;
  baselineId: string;
  actorId: string;
}): Promise<void> {
  await db
    .delete(schema.baselines)
    .where(
      and(
        eq(schema.baselines.id, opts.baselineId),
        eq(schema.baselines.projectId, opts.projectId)
      )
    );
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "baseline.delete",
    targetType: "baseline",
    targetId: opts.baselineId,
  });
}
