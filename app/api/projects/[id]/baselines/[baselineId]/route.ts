import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapability } from "@/lib/auth/permission";
import { deleteBaseline, getBaselineTasks } from "@/lib/projects/baselines";

export const runtime = "nodejs";

/** Snapshot rows for one baseline (for rendering ghost bars). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; baselineId: string }> }
) {
  const { id: projectId, baselineId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tasks = await getBaselineTasks(projectId, baselineId);
  if (tasks === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ tasks });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; baselineId: string }> }
) {
  const { id: projectId, baselineId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteBaseline({ projectId, baselineId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
