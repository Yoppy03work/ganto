import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { restoreProject } from "@/lib/projects/project-trash";

export const runtime = "nodejs";

/** Restore a soft-deleted project. Requires project.delete (same authority
 *  that removed it). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  // Restore is the one capability check that must run against a soft-deleted
  // project — every other capability check rejects trashed projects.
  if (
    !(await hasCapability(user.id, projectId, "project.delete", {
      includeDeleted: true,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ok = await restoreProject({ projectId, actorId: user.id });
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
