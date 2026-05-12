import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import {
  deleteComment,
  getCommentAuthor,
  taskBelongsToProject,
} from "@/lib/projects/comments";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; taskId: string; commentId: string }>;
  }
) {
  const { id: projectId, taskId, commentId } = await params;
  const user = await requireCurrentUser();
  if (!(await taskBelongsToProject(taskId, projectId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Authors can delete their own comments. Otherwise need task.update.
  const authorId = await getCommentAuthor(commentId);
  if (authorId !== user.id) {
    const allowed = await hasCapability(user.id, projectId, "task.update");
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await deleteComment({ projectId, commentId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
