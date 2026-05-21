import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { createShareToken, listShareTokens } from "@/lib/projects/share";

export const runtime = "nodejs";

// Listing raw tokens exposes the public read-only URLs, so reads are gated by
// the same `project.settings` capability as creation — a plain member must not
// be able to extract and redistribute existing share links.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tokens = await listShareTokens(projectId);
  return NextResponse.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      token: t.token,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

/**
 * Create a public read-only share link. Sharing widens the audience, so this
 * requires `project.settings` (an admin-ish capability) — consistent with the
 * "actions that expand audience" guardrail.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, token, createdAt } = await createShareToken({ projectId, actorId: user.id });
  return NextResponse.json(
    { id, token, createdAt: createdAt.toISOString() },
    { status: 201 }
  );
}
