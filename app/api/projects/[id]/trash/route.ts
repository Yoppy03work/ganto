import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapability, hasCapabilityFor } from "@/lib/auth/permission";
import { listTrash } from "@/lib/projects/tasks";

export const runtime = "nodejs";

/**
 * List soft-deleted tasks for the project. Visible to anyone who can delete
 * tasks (either any task or their own). The `own` flag in the response lets
 * the UI hide rows the caller can't actually restore.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Visibility tiers:
  //  - `task.delete` (any scope)  → see every soft-deleted task
  //  - `task.delete.own`          → see only tasks I deleted myself
  //  - neither                    → 403
  //
  // Filtering at the DB layer (not the route) so an own-scope user truly
  // cannot enumerate other members' deletions even via raw API responses.
  const canDeleteAny = await hasCapability(user.id, projectId, "task.delete");
  const canDeleteOwn = await hasCapabilityFor(
    user.id,
    projectId,
    "task.delete",
    true
  );
  if (!canDeleteAny && !canDeleteOwn) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const trash = await listTrash(
    projectId,
    canDeleteAny ? undefined : user.id
  );
  return NextResponse.json({ trash, canDeleteAny });
}
