import "server-only";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type AttachmentRow = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: Date;
};

export async function listTaskAttachments(
  taskId: string
): Promise<AttachmentRow[]> {
  const rows = await db
    .select({
      id: schema.attachments.id,
      filename: schema.attachments.filename,
      contentType: schema.attachments.contentType,
      size: schema.attachments.size,
      url: schema.attachments.url,
      uploadedBy: schema.attachments.uploadedBy,
      uploaderName: schema.neonUsers.name,
      createdAt: schema.attachments.createdAt,
    })
    .from(schema.attachments)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.attachments.uploadedBy}::uuid = ${schema.neonUsers.id}`
    )
    .where(eq(schema.attachments.taskId, taskId))
    .orderBy(desc(schema.attachments.createdAt));
  return rows;
}

export async function recordAttachment(opts: {
  projectId: string;
  taskId: string;
  actorId: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.attachments)
    .values({
      taskId: opts.taskId,
      projectId: opts.projectId,
      filename: opts.filename,
      contentType: opts.contentType,
      size: opts.size,
      url: opts.url,
      uploadedBy: opts.actorId,
    })
    .returning({ id: schema.attachments.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "attachment.add",
    targetType: "task",
    targetId: opts.taskId,
    after: { filename: opts.filename, size: opts.size },
  });
  return { id: row.id };
}

/** Returns the blob URL of the deleted attachment (so the route can delete
 *  the blob bytes too), or null if not found / not in this project+task.
 *
 *  `taskId` MUST be part of the lookup: authorization in the route is computed
 *  from the taskId path segment, so without scoping the delete to that task a
 *  user with `own`-scoped task.update on task A could delete task B's
 *  attachment by passing A's taskId + B's attachmentId. */
export async function deleteAttachment(opts: {
  projectId: string;
  taskId: string;
  attachmentId: string;
  actorId: string;
}): Promise<string | null> {
  const [row] = await db
    .select({
      id: schema.attachments.id,
      url: schema.attachments.url,
      taskId: schema.attachments.taskId,
      filename: schema.attachments.filename,
    })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.id, opts.attachmentId),
        eq(schema.attachments.projectId, opts.projectId),
        eq(schema.attachments.taskId, opts.taskId)
      )
    )
    .limit(1);
  if (!row) return null;

  await db.delete(schema.attachments).where(eq(schema.attachments.id, opts.attachmentId));
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "attachment.remove",
    targetType: "task",
    targetId: row.taskId,
    before: { filename: row.filename },
  });
  return row.url;
}
