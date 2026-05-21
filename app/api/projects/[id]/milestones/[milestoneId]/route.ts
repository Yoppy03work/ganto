import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { deleteMilestone, updateMilestone } from "@/lib/projects/milestones";
import {
  ConflictError,
  conflictResponse,
  missingLockVersionResponse,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const PatchInput = z.object({
  expectedLockVersion: z
    .number()
    .int()
    .nonnegative({ message: "expectedLockVersion is required" }),
  title: z.string().min(1).max(200).optional(),
  date: isoDateLike.optional(),
  color: z.string().max(20).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const { id: projectId, milestoneId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
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
  const { expectedLockVersion, date, ...rest } = parsed.data;
  try {
    const { lockVersion } = await updateMilestone({
      projectId,
      milestoneId,
      actorId: user.id,
      expectedLockVersion,
      patch: { ...rest, ...(date ? { date: new Date(date) } : {}) },
    });
    return NextResponse.json({ ok: true, lockVersion });
  } catch (e) {
    if (e instanceof ConflictError) return conflictResponse(e)!;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  const { id: projectId, milestoneId } = await params;
  const user = await requireCurrentUser();
  if (!(await hasCapability(user.id, projectId, "task.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteMilestone({ projectId, milestoneId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
