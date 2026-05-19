import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapabilityFor } from "@/lib/auth/permission";
import { deleteTask, getTask, updateTask } from "@/lib/projects/tasks";
import {
  conflictResponse,
  missingLockVersionResponse,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

const isoDateLike = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const PatchInput = z.object({
  // Required: optimistic concurrency token. Missing/non-int → 400.
  expectedLockVersion: z
    .number()
    .int()
    .nonnegative({ message: "expectedLockVersion is required" }),
  title: z.string().min(1).max(500).optional(),
  status: z.string().min(1).max(50).optional(),
  type: z.string().max(50).optional().nullable(),
  startAt: isoDateLike.optional().nullable(),
  endAt: isoDateLike.optional().nullable(),
  progress: z.number().min(0).max(1).optional().nullable(),
  visibility: z.enum(["all", "members", "private"]).optional(),
  position: z.number().int().optional(),
});

async function ensureCanWrite(
  userId: string,
  projectId: string,
  taskId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const t = await getTask(taskId, projectId);
  if (!t) return { ok: false, status: 404, error: "Not found" };
  const isOwner = t.createdBy === userId;
  const ok = await hasCapabilityFor(userId, projectId, "task.update", isOwner);
  return ok ? { ok: true } : { ok: false, status: 403, error: "Forbidden" };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  const guard = await ensureCanWrite(user.id, projectId, taskId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    // Distinguish missing expectedLockVersion (400, dedicated code) from
    // other validation errors so the client can react appropriately.
    const lockResp = missingLockVersionResponse(parsed.error);
    if (lockResp) return lockResp;
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { expectedLockVersion, ...patchRaw } = parsed.data;
  const patch = {
    ...patchRaw,
    startAt: patchRaw.startAt === undefined
      ? undefined
      : patchRaw.startAt === null
        ? null
        : new Date(patchRaw.startAt),
    endAt: patchRaw.endAt === undefined
      ? undefined
      : patchRaw.endAt === null
        ? null
        : new Date(patchRaw.endAt),
  };
  try {
    const { lockVersion } = await updateTask({
      taskId,
      projectId,
      actorId: user.id,
      expectedLockVersion,
      patch,
    });
    return NextResponse.json({ ok: true, lockVersion });
  } catch (e) {
    const conflict = conflictResponse(e);
    if (conflict) return conflict;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();
  const t = await getTask(taskId, projectId);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isOwner = t.createdBy === user.id;
  const allowed = await hasCapabilityFor(user.id, projectId, "task.delete", isOwner);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteTask({ taskId, projectId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
