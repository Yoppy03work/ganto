import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapabilityFor } from "@/lib/auth/permission";
import { getTask } from "@/lib/projects/tasks";
import { taskBelongsToProject } from "@/lib/projects/comments";
import { listTaskAttachments, recordAttachment } from "@/lib/projects/attachments";

export const runtime = "nodejs";

// Server-route upload goes through the function body, so it's bounded by the
// platform request-body limit (~4.5MB on Vercel). Cap a bit under that.
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await taskBelongsToProject(taskId, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const attachments = await listTaskAttachments(taskId);
  return NextResponse.json({ attachments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();

  // Editing a task (incl. attaching files) requires task.update (own-aware).
  const task = await getTask(taskId, projectId);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = task.createdBy === user.id;
  if (!(await hasCapabilityFor(user.id, projectId, "task.update", isOwner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "ファイルストレージが未設定です。BLOB_READ_WRITE_TOKEN を設定してください。",
        code: "STORAGE_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `ファイルが大きすぎます（最大 ${MAX_BYTES / 1024 / 1024}MB）` },
      { status: 413 }
    );
  }

  // Namespace blobs by project/task. addRandomSuffix prevents collisions and
  // makes URLs unguessable.
  const blob = await put(
    `projects/${projectId}/tasks/${taskId}/${file.name}`,
    file,
    { access: "public", addRandomSuffix: true }
  );

  const result = await recordAttachment({
    projectId,
    taskId,
    actorId: user.id,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    url: blob.url,
  });
  return NextResponse.json({ id: result.id, url: blob.url }, { status: 201 });
}
