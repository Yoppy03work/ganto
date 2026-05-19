import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import { recordAudit } from "@/lib/audit/log";
import {
  ConflictError,
  conflictResponse,
  ensureUpdated,
  missingLockVersionResponse,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

const PatchInput = z.object({
  expectedLockVersion: z
    .number()
    .int()
    .nonnegative({ message: "expectedLockVersion is required" }),
  roleId: z.string().min(1).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await params;
  const me = await requireCurrentUser();

  if (!(await hasCapability(me.id, projectId, "member.role.change"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    const lockResp = missingLockVersionResponse(parsed.error);
    if (lockResp) return lockResp;
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const before = await getMembership(targetUserId, projectId);
  if (!before) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }
  if (before.roleName === "Owner") {
    return NextResponse.json(
      { error: "Cannot edit Owner. Transfer ownership first." },
      { status: 400 }
    );
  }

  const updates: Partial<{ roleId: string; status: "active" | "suspended" }> = {};
  if (parsed.data.roleId) updates.roleId = parsed.data.roleId;
  if (parsed.data.status) updates.status = parsed.data.status;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Ensure roleId, if given, belongs to this project (and isn't Owner).
  if (updates.roleId) {
    const [role] = await db
      .select({ id: schema.roles.id, name: schema.roles.name })
      .from(schema.roles)
      .where(and(eq(schema.roles.id, updates.roleId), eq(schema.roles.projectId, projectId)))
      .limit(1);
    if (!role) {
      return NextResponse.json({ error: "Role not found in project" }, { status: 400 });
    }
    if (role.name === "Owner") {
      return NextResponse.json({ error: "Cannot assign Owner directly" }, { status: 400 });
    }
  }

  try {
    const updated = await db
      .update(schema.memberships)
      .set({ ...updates, lockVersion: sql`${schema.memberships.lockVersion} + 1` })
      .where(
        and(
          eq(schema.memberships.projectId, projectId),
          eq(schema.memberships.userId, targetUserId),
          eq(schema.memberships.lockVersion, parsed.data.expectedLockVersion)
        )
      )
      .returning({ lockVersion: schema.memberships.lockVersion });
    ensureUpdated(updated);

    await recordAudit({
      projectId,
      actorId: me.id,
      action: updates.status ? "membership.status" : "membership.role",
      targetType: "membership",
      targetId: targetUserId,
      before: { roleId: before.roleId, status: before.status },
      after: updates,
    });

    return NextResponse.json({ ok: true, lockVersion: updated[0].lockVersion });
  } catch (e) {
    if (e instanceof ConflictError) {
      return conflictResponse(e)!;
    }
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await params;
  const me = await requireCurrentUser();

  // Self-removal is always allowed; otherwise need member.remove capability.
  if (me.id !== targetUserId) {
    if (!(await hasCapability(me.id, projectId, "member.remove"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const target = await getMembership(targetUserId, projectId);
  if (!target) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }
  if (target.roleName === "Owner") {
    return NextResponse.json(
      { error: "Cannot remove the Owner. Transfer ownership first." },
      { status: 400 }
    );
  }

  await db
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.projectId, projectId),
        eq(schema.memberships.userId, targetUserId)
      )
    );

  await recordAudit({
    projectId,
    actorId: me.id,
    action: "membership.delete",
    targetType: "membership",
    targetId: targetUserId,
    before: { roleId: target.roleId, status: target.status },
  });

  return NextResponse.json({ ok: true });
}
