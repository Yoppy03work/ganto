import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import {
  ALL_CAPABILITIES,
  createCustomRole,
  listRolesWithCapabilities,
} from "@/lib/projects/roles";

export const runtime = "nodejs";

const CapabilityInputSchema = z.object({
  capability: z.string().min(1),
  scope: z.enum(["all", "own"]),
});

const CreateRoleInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional().nullable(),
  capabilities: z.array(CapabilityInputSchema).max(50),
});

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
  const roles = await listRolesWithCapabilities(projectId);
  return NextResponse.json({
    roles,
    catalog: ALL_CAPABILITIES,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "role.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateRoleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  // Validate capabilities exist in our catalog.
  const known = new Set(ALL_CAPABILITIES.map((c) => c.capability));
  for (const c of parsed.data.capabilities) {
    if (!known.has(c.capability)) {
      return NextResponse.json(
        { error: `Unknown capability: ${c.capability}` },
        { status: 400 }
      );
    }
  }
  const role = await createCustomRole({
    projectId,
    actorId: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    capabilities: parsed.data.capabilities,
  });
  return NextResponse.json(role, { status: 201 });
}
