import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { getMembership } from "@/lib/projects/members";
import { recordAudit } from "@/lib/audit/log";
import {
  conflictResponse,
  ensureUpdated,
  missingLockVersionResponse,
  ConflictError,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

const PatchInput = z.object({
  expectedLockVersion: z
    .number()
    .int()
    .nonnegative({ message: "expectedLockVersion is required" }),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  storageMode: z.enum(["local", "github"]).optional(),
  githubOwner: z.string().max(120).optional().nullable(),
  githubProjectNumber: z.number().int().positive().optional().nullable(),
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
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.settings"))) {
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

  const [before] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { expectedLockVersion, ...rest } = parsed.data;
  const updates: Partial<typeof before> & { updatedAt: Date } = { updatedAt: new Date() };
  if (rest.name !== undefined) updates.name = rest.name;
  if (rest.description !== undefined) updates.description = rest.description;
  if (rest.storageMode !== undefined) updates.storageMode = rest.storageMode;
  if (rest.githubOwner !== undefined) updates.githubOwner = rest.githubOwner;
  if (rest.githubProjectNumber !== undefined) {
    updates.githubProjectNumber = rest.githubProjectNumber;
  }

  try {
    const updated = await db
      .update(schema.projects)
      .set({ ...updates, lockVersion: sql`${schema.projects.lockVersion} + 1` })
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.lockVersion, expectedLockVersion)
        )
      )
      .returning({ lockVersion: schema.projects.lockVersion });
    ensureUpdated(updated);

    await recordAudit({
      projectId,
      actorId: user.id,
      action: "project.update",
      targetType: "project",
      targetId: projectId,
      before: {
        name: before.name,
        description: before.description,
        storageMode: before.storageMode,
        githubOwner: before.githubOwner,
        githubProjectNumber: before.githubProjectNumber,
      },
      after: rest,
    });

    return NextResponse.json({ ok: true, lockVersion: updated[0].lockVersion });
  } catch (e) {
    if (e instanceof ConflictError) {
      return conflictResponse(e)!;
    }
    throw e;
  }
}

/**
 * Soft-delete a project. The row is preserved with deleted_at + deleted_by so
 * it can be restored from the project Trash. Replaces the old
 * ALLOW_PROJECT_DELETE hard-delete gate — soft delete is the safe default, no
 * env flag needed.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "project.delete"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [before] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt))
    )
    .limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(schema.projects)
    .set({ deletedAt: new Date(), deletedByUserId: user.id })
    .where(eq(schema.projects.id, projectId));

  await recordAudit({
    projectId,
    actorId: user.id,
    action: "project.delete",
    targetType: "project",
    targetId: projectId,
    before: { name: before.name },
  });

  return NextResponse.json({ ok: true });
}
