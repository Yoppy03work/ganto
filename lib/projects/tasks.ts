import "server-only";
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { ensureUpdated } from "@/lib/concurrency/optimistic-lock";

export type GanttTaskRow = {
  id: string;
  title: string;
  status: string;
  type: string | null;
  startAt: Date | null;
  endAt: Date | null;
  progress: number | null;
  visibility: "all" | "members" | "private";
  position: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Optimistic concurrency token — pass back in the next PATCH. */
  lockVersion: number;
  assignees: { userId: string; name: string; image: string | null }[];
};

/**
 * List all tasks for a project with their assignees joined to neon_auth.user.
 * Visibility filter applied caller-side using the user's role.
 */
export async function listProjectTasks(projectId: string): Promise<GanttTaskRow[]> {
  const taskRows = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .orderBy(schema.tasks.position);
  if (taskRows.length === 0) return [];

  // Pull assignees + their user info in one shot.
  const ids = taskRows.map((t) => t.id);
  const assigneeRows = await db
    .select({
      taskId: schema.taskAssignees.taskId,
      userId: schema.taskAssignees.userId,
      name: schema.neonUsers.name,
      image: schema.neonUsers.image,
    })
    .from(schema.taskAssignees)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.taskAssignees.userId}::uuid = ${schema.neonUsers.id}`
    )
    .where(inArray(schema.taskAssignees.taskId, ids));

  const byTask = new Map<string, GanttTaskRow["assignees"]>();
  for (const a of assigneeRows) {
    const list = byTask.get(a.taskId) ?? [];
    list.push({
      userId: a.userId,
      name: a.name ?? "(unknown)",
      image: a.image ?? null,
    });
    byTask.set(a.taskId, list);
  }

  return taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    type: t.type,
    startAt: t.startAt,
    endAt: t.endAt,
    progress: t.progress,
    visibility: t.visibility as "all" | "members" | "private",
    position: t.position,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    lockVersion: t.lockVersion,
    assignees: byTask.get(t.id) ?? [],
  }));
}

export async function getTask(taskId: string, projectId: string) {
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, taskId),
        eq(schema.tasks.projectId, projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export type CreateTaskInput = {
  projectId: string;
  actorId: string;
  title: string;
  status?: string;
  type?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  progress?: number | null;
  visibility?: "all" | "members" | "private";
};

export async function createTask(opts: CreateTaskInput): Promise<{ id: string }> {
  // Place new tasks at the bottom of the list (ignore soft-deleted rows for
  // the max-position calc — they're effectively gone from the user's view).
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  const [row] = await db
    .insert(schema.tasks)
    .values({
      projectId: opts.projectId,
      title: opts.title,
      status: opts.status ?? "Todo",
      type: opts.type ?? null,
      startAt: opts.startAt ?? null,
      endAt: opts.endAt ?? null,
      progress: opts.progress ?? null,
      visibility: opts.visibility ?? "all",
      position: Number(maxPos) + 1,
      createdBy: opts.actorId,
    })
    .returning({ id: schema.tasks.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.create",
    targetType: "task",
    targetId: row.id,
    after: {
      title: opts.title,
      status: opts.status ?? "Todo",
      startAt: opts.startAt,
      endAt: opts.endAt,
    },
  });

  return { id: row.id };
}

export type UpdateTaskInput = {
  taskId: string;
  projectId: string;
  actorId: string;
  /** Optimistic concurrency token from the client's last read. */
  expectedLockVersion: number;
  patch: {
    title?: string;
    status?: string;
    type?: string | null;
    startAt?: Date | null;
    endAt?: Date | null;
    progress?: number | null;
    visibility?: "all" | "members" | "private";
    position?: number;
  };
};

/**
 * Result of an update. `lockVersion` is the *new* value clients should hold
 * onto for their next mutation.
 */
export type UpdateTaskResult = { lockVersion: number };

export async function updateTask(opts: UpdateTaskInput): Promise<UpdateTaskResult> {
  const before = await getTask(opts.taskId, opts.projectId);
  if (!before) throw new Error("Task not found");

  const updated = await db
    .update(schema.tasks)
    .set({
      ...opts.patch,
      updatedAt: new Date(),
      lockVersion: sql`${schema.tasks.lockVersion} + 1`,
    })
    .where(
      and(
        eq(schema.tasks.id, opts.taskId),
        eq(schema.tasks.projectId, opts.projectId),
        eq(schema.tasks.lockVersion, opts.expectedLockVersion),
        isNull(schema.tasks.deletedAt)
      )
    )
    .returning({ lockVersion: schema.tasks.lockVersion });

  ensureUpdated(updated);

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.update",
    targetType: "task",
    targetId: opts.taskId,
    before: {
      title: before.title,
      status: before.status,
      startAt: before.startAt,
      endAt: before.endAt,
      progress: before.progress,
    },
    after: opts.patch,
  });

  return { lockVersion: updated[0].lockVersion };
}

/**
 * Soft-delete a task. The row is preserved (with `deleted_at` + `deleted_by`)
 * so the user can recover it from Trash. The unique constraint on
 * `(project_id, external_id)` could conceivably collide if the same external
 * id is re-imported while a soft-deleted row still exists; we accept that
 * tradeoff for MVP since restore-then-import is the right user flow.
 */
export async function deleteTask(opts: {
  taskId: string;
  projectId: string;
  actorId: string;
}): Promise<void> {
  const before = await getTask(opts.taskId, opts.projectId);
  if (!before) throw new Error("Task not found");

  await db
    .update(schema.tasks)
    .set({
      deletedAt: new Date(),
      deletedByUserId: opts.actorId,
      // Bump lockVersion so any in-flight clients holding the old value see
      // 409 when they try to PATCH a now-deleted task.
      lockVersion: sql`${schema.tasks.lockVersion} + 1`,
    })
    .where(
      and(
        eq(schema.tasks.id, opts.taskId),
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.delete",
    targetType: "task",
    targetId: opts.taskId,
    before: { title: before.title, status: before.status },
  });
}

/**
 * Restore a soft-deleted task. The task is placed at the END of the active
 * task list (not its original position) to avoid colliding with positions
 * that other tasks have taken since deletion. The user can drag it back to
 * the desired position afterwards.
 */
export async function restoreTask(opts: {
  taskId: string;
  projectId: string;
  actorId: string;
}): Promise<void> {
  const [row] = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      originalPosition: schema.tasks.position,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, opts.taskId),
        eq(schema.tasks.projectId, opts.projectId),
        sql`${schema.tasks.deletedAt} IS NOT NULL`
      )
    )
    .limit(1);
  if (!row) throw new Error("Deleted task not found");

  // Compute new tail position from active (non-deleted) tasks.
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${schema.tasks.position}), 0)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.projectId, opts.projectId),
        isNull(schema.tasks.deletedAt)
      )
    );

  const newPosition = Number(maxPos) + 1;

  await db
    .update(schema.tasks)
    .set({
      deletedAt: null,
      deletedByUserId: null,
      position: newPosition,
      updatedAt: new Date(),
      lockVersion: sql`${schema.tasks.lockVersion} + 1`,
    })
    .where(
      and(
        eq(schema.tasks.id, opts.taskId),
        eq(schema.tasks.projectId, opts.projectId)
      )
    );

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "task.restore",
    targetType: "task",
    targetId: opts.taskId,
    before: { position: row.originalPosition, title: row.title },
    after: { position: newPosition },
  });
}

/**
 * List soft-deleted tasks for the project, with deleter user info joined.
 * Used by the Trash UI.
 *
 * Pass `ownOnlyForUserId` to restrict the result to tasks the given user
 * deleted themselves. This matches the semantics of `task.delete.own` —
 * users with only that scope shouldn't see rows they can't restore.
 */
export type TrashRow = {
  id: string;
  title: string;
  deletedAt: Date;
  deletedBy: { id: string; name: string } | null;
};

export async function listTrash(
  projectId: string,
  ownOnlyForUserId?: string
): Promise<TrashRow[]> {
  const whereClauses = [
    eq(schema.tasks.projectId, projectId),
    sql`${schema.tasks.deletedAt} IS NOT NULL`,
  ];
  if (ownOnlyForUserId) {
    whereClauses.push(eq(schema.tasks.deletedByUserId, ownOnlyForUserId));
  }

  const rows = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      deletedAt: schema.tasks.deletedAt,
      deletedByUserId: schema.tasks.deletedByUserId,
      deletedByName: schema.neonUsers.name,
    })
    .from(schema.tasks)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.tasks.deletedByUserId}::uuid = ${schema.neonUsers.id}`
    )
    .where(and(...whereClauses))
    .orderBy(sql`${schema.tasks.deletedAt} DESC`);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    deletedAt: r.deletedAt as Date,
    deletedBy: r.deletedByUserId
      ? { id: r.deletedByUserId, name: r.deletedByName ?? "(unknown)" }
      : null,
  }));
}
