import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import {
  ALL_CAPABILITIES,
  deleteCustomRole,
  updateCustomRole,
} from "@/lib/projects/roles";
import {
  ConflictError,
  conflictResponse,
  missingLockVersionResponse,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

const CapabilityInputSchema = z.object({
  capability: z.string().min(1),
  scope: z.enum(["all", "own"]),
});

const UpdateRoleInput = z.object({
  expectedLockVersion: z
    .number()
    .int()
    .nonnegative({ message: "expectedLockVersion is required" }),
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(500).optional().nullable(),
  capabilities: z.array(CapabilityInputSchema).max(50).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id: projectId, roleId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "role.update"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = UpdateRoleInput.safeParse(body);
  if (!parsed.success) {
    const lockResp = missingLockVersionResponse(parsed.error);
    if (lockResp) return lockResp;
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (parsed.data.capabilities) {
    const known = new Set(ALL_CAPABILITIES.map((c) => c.capability));
    for (const c of parsed.data.capabilities) {
      if (!known.has(c.capability)) {
        return NextResponse.json(
          { error: `Unknown capability: ${c.capability}` },
          { status: 400 }
        );
      }
    }
  }
  try {
    const { lockVersion } = await updateCustomRole({
      projectId,
      roleId,
      actorId: user.id,
      expectedLockVersion: parsed.data.expectedLockVersion,
      name: parsed.data.name,
      description: parsed.data.description,
      capabilities: parsed.data.capabilities,
    });
    return NextResponse.json({ ok: true, lockVersion });
  } catch (e) {
    if (e instanceof ConflictError) {
      return conflictResponse(e)!;
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id: projectId, roleId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "role.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await deleteCustomRole({ projectId, roleId, actorId: user.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
