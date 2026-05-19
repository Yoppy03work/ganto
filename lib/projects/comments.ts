import "server-only";
import { eq, and, sql, asc, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type TaskComment = {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const rows = await db
    .select({
      id: schema.comments.id,
      body: schema.comments.body,
      authorId: schema.comments.authorId,
      authorName: schema.neonUsers.name,
      authorImage: schema.neonUsers.image,
      createdAt: schema.comments.createdAt,
      updatedAt: schema.comments.updatedAt,
    })
    .from(schema.comments)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.comments.authorId}::uuid = ${schema.neonUsers.id}`
    )
    .where(eq(schema.comments.taskId, taskId))
    .orderBy(asc(schema.comments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    authorId: r.authorId,
    authorName: r.authorName,
    authorImage: r.authorImage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function createComment(opts: {
  projectId: string;
  taskId: string;
  authorId: string;
  body: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.comments)
    .values({
      taskId: opts.taskId,
      authorId: opts.authorId,
      body: opts.body,
    })
    .returning({ id: schema.comments.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.authorId,
    action: "comment.create",
    targetType: "comment",
    targetId: row.id,
    after: { taskId: opts.taskId, length: opts.body.length },
  });

  return { id: row.id };
}

export async function deleteComment(opts: {
  projectId: string;
  commentId: string;
  actorId: string;
}): Promise<void> {
  const [before] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, opts.commentId))
    .limit(1);
  if (!before) throw new Error("Comment not found");

  await db.delete(schema.comments).where(eq(schema.comments.id, opts.commentId));

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "comment.delete",
    targetType: "comment",
    targetId: opts.commentId,
    before: { taskId: before.taskId, authorId: before.authorId },
  });
}

export async function getCommentAuthor(commentId: string): Promise<string | null> {
  const [row] = await db
    .select({ authorId: schema.comments.authorId })
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .limit(1);
  return row?.authorId ?? null;
}

/**
 * Look up a task's project — used to scope routes safely. Soft-deleted tasks
 * return null because no live operation should reference them.
 */
export async function getTaskProjectId(taskId: string): Promise<string | null> {
  const [row] = await db
    .select({ projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, taskId), isNull(schema.tasks.deletedAt)))
    .limit(1);
  return row?.projectId ?? null;
}

/** Verify (taskId, projectId) pair and that the task is active. */
export async function taskBelongsToProject(taskId: string, projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, taskId),
        eq(schema.tasks.projectId, projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .limit(1);
  return !!row;
}
