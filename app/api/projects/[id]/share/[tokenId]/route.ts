import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { revokeShareToken } from "@/lib/projects/share";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id: projectId, tokenId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await revokeShareToken({ projectId, tokenId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
