import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import { createInvitation, listPendingInvitations } from "@/lib/projects/invitations";

export const runtime = "nodejs";

const CreateInput = z.object({
  roleId: z.string().min(1),
  email: z.string().email().optional().nullable(),
});

function appUrl(req: Request): string {
  return (
    process.env.APP_URL ?? new URL(req.url).origin
  );
}

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
  const invitations = await listPendingInvitations(projectId);
  return NextResponse.json({ invitations });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  const allowed = await hasCapability(user.id, projectId, "member.invite");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const result = await createInvitation({
    projectId,
    roleId: parsed.data.roleId,
    email: parsed.data.email,
    invitedBy: user.id,
    appUrl: appUrl(req),
  });
  return NextResponse.json(result, { status: 201 });
}
