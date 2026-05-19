import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { acceptInvitation, resolveInvitation } from "@/lib/projects/invitations";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const inv = await resolveInvitation(token);
  if (!inv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    projectId: inv.projectId,
    projectName: inv.projectName,
    roleName: inv.roleName,
    email: inv.email,
    status: inv.status,
    expiresAt: inv.expiresAt,
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const user = await requireCurrentUser();
  const result = await acceptInvitation({ token, userId: user.id });
  if (!result.ok) {
    const status = result.reason === "missing" ? 404 : 410;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({
    projectId: result.projectId,
    alreadyMember: result.alreadyMember,
  });
}
