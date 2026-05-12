import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapabilityFor } from "@/lib/auth/permission";
import { restoreTask } from "@/lib/projects/tasks";

export const runtime = "nodejs";

/**
 * Restore a soft-deleted task to the active list. The task is placed at the
 * end of the project (not its original position) so it never collides with
 * other tasks that may have shifted in the meantime.
 *
 * Permissions: `task.delete.any` always allowed; `task.delete.own` allowed
 * only if the caller was the one who deleted the task.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await params;
  const user = await requireCurrentUser();

  // Look up the deleted task to enforce ownership for `own`-scoped users.
  const [row] = await db
    .select({
      id: schema.tasks.id,
      deletedByUserId: schema.tasks.deletedByUserId,
      createdBy: schema.tasks.createdBy,
    })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.id, taskId),
        eq(schema.tasks.projectId, projectId),
        sql`${schema.tasks.deletedAt} IS NOT NULL`
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `own` here means "I created or deleted it." Otherwise require the wider
  // scope.
  const isOwner = row.deletedByUserId === user.id || row.createdBy === user.id;
  const allowed = await hasCapabilityFor(user.id, projectId, "task.delete", isOwner);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await restoreTask({ taskId, projectId, actorId: user.id });
  return NextResponse.json({ ok: true });
}
