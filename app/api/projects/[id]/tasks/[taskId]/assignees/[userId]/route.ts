import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapabilityFor } from "@/lib/auth/permission";
import { getTask } from "@/lib/projects/tasks";
import { getMembership } from "@/lib/projects/members";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

async function ensureCanModify(
  actorId: string,
  projectId: string,
  taskId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const t = await getTask(taskId, projectId);
  if (!t) return { ok: false, status: 404, error: "Not found" };
  const isOwner = t.createdBy === actorId;
  const ok = await hasCapabilityFor(actorId, projectId, "task.update", isOwner);
  return ok ? { ok: true } : { ok: false, status: 403, error: "Forbidden" };
}

export async function PUT(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; taskId: string; userId: string }>;
  }
) {
  const { id: projectId, taskId, userId } = await params;
  const me = await requireCurrentUser();
  const guard = await ensureCanModify(me.id, projectId, taskId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // Target user must be a member of the project.
  const membership = await getMembership(userId, projectId);
  if (!membership) {
    return NextResponse.json({ error: "User not a member" }, { status: 400 });
  }

  // Idempotent insert.
  const existing = await db
    .select({ taskId: schema.taskAssignees.taskId })
    .from(schema.taskAssignees)
    .where(
      and(
        eq(schema.taskAssignees.taskId, taskId),
        eq(schema.taskAssignees.userId, userId)
      )
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(schema.taskAssignees).values({ taskId, userId });
    await recordAudit({
      projectId,
      actorId: me.id,
      action: "task.assignee.add",
      targetType: "task",
      targetId: taskId,
      after: { userId },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; taskId: string; userId: string }>;
  }
) {
  const { id: projectId, taskId, userId } = await params;
  const me = await requireCurrentUser();
  const guard = await ensureCanModify(me.id, projectId, taskId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  await db
    .delete(schema.taskAssignees)
    .where(
      and(
        eq(schema.taskAssignees.taskId, taskId),
        eq(schema.taskAssignees.userId, userId)
      )
    );
  await recordAudit({
    projectId,
    actorId: me.id,
    action: "task.assignee.remove",
    targetType: "task",
    targetId: taskId,
    before: { userId },
  });
  return NextResponse.json({ ok: true });
}
