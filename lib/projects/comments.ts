import "server-only";
import { eq, and, sql, asc, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { listProjectMembers } from "@/lib/projects/members";
import { parseMentions } from "@/lib/projects/mentions";
import { createNotifications } from "@/lib/projects/notifications";
import { sendEmail, notificationEmail } from "@/lib/email/send";

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

  // Best-effort @mention notifications. Never let this break comment creation.
  try {
    await notifyMentions(opts);
  } catch (e) {
    // Swallow — the comment is already saved; notification is auxiliary.
    console.warn("[comments] mention notification failed", e);
  }

  return { id: row.id };
}

/**
 * Parse @mentions in a freshly-created comment, write in-app notifications,
 * and fire best-effort emails. Self-mentions are skipped by createNotifications.
 */
async function notifyMentions(opts: {
  projectId: string;
  taskId: string;
  authorId: string;
  body: string;
}): Promise<void> {
  const members = await listProjectMembers(opts.projectId);
  const mentionedIds = parseMentions(
    opts.body,
    members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))
  ).filter((id) => id !== opts.authorId);
  if (mentionedIds.length === 0) return;

  // Look up project name + task title + actor name for the notification body.
  const [project] = await db
    .select({ name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, opts.projectId))
    .limit(1);
  const [task] = await db
    .select({ title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, opts.taskId))
    .limit(1);
  const actor = members.find((m) => m.userId === opts.authorId);
  const actorName = actor?.name ?? "Someone";
  const projectName = project?.name ?? "project";
  const taskTitle = task?.title ?? null;

  await createNotifications(
    mentionedIds.map((userId) => ({
      userId,
      projectId: opts.projectId,
      taskId: opts.taskId,
      type: "mention",
      actorId: opts.authorId,
      title: `${actorName} がコメントであなたをメンションしました`,
      body: taskTitle,
    }))
  );

  // Best-effort emails.
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
  const url = `${appUrl}/p/${opts.projectId}`;
  for (const userId of mentionedIds) {
    const recipient = members.find((m) => m.userId === userId);
    if (!recipient?.email) continue;
    const mail = notificationEmail({
      recipientName: recipient.name,
      actorName,
      projectName,
      taskTitle,
      kind: "mention",
      url,
    });
    void sendEmail({ to: recipient.email, ...mail });
  }
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
