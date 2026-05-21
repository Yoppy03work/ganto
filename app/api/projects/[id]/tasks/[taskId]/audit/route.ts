import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { taskBelongsToProject } from "@/lib/projects/comments";
import { listTaskAudit } from "@/lib/projects/audit";

export const runtime = "nodejs";

/**
 * Per-task audit history. Any project member can view it (same visibility as
 * the project-wide audit log). Powers the "History" tab in the task sidepanel.
 */
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
  const entries = await listTaskAudit(projectId, taskId);
  return NextResponse.json({ entries });
}
