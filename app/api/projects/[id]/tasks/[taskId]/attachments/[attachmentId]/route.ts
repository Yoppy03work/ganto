import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapabilityFor } from "@/lib/auth/permission";
import { getTask } from "@/lib/projects/tasks";
import { deleteAttachment } from "@/lib/projects/attachments";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; taskId: string; attachmentId: string }>;
  }
) {
  const { id: projectId, taskId, attachmentId } = await params;
  const user = await requireCurrentUser();

  const task = await getTask(taskId, projectId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = task.createdBy === user.id;
  if (!(await hasCapabilityFor(user.id, projectId, "task.update", isOwner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = await deleteAttachment({ projectId, taskId, attachmentId, actorId: user.id });
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort blob byte deletion (DB row is already gone).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(url);
    } catch {
      // ignore — orphaned blob is acceptable; the metadata is what matters
    }
  }
  return NextResponse.json({ ok: true });
}
