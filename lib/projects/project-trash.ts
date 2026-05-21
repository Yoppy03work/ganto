import "server-only";
import { and, eq, isNotNull, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type DeletedProjectRow = {
  id: string;
  name: string;
  deletedAt: Date;
};

/**
 * Soft-deleted projects the user is (still) a member of. Used by the home-page
 * "Deleted projects" restore view.
 */
export async function listDeletedProjectsForUser(
  userId: string
): Promise<DeletedProjectRow[]> {
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      deletedAt: schema.projects.deletedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.memberships.projectId))
    .where(
      and(
        eq(schema.memberships.userId, userId),
        isNotNull(schema.projects.deletedAt)
      )
    )
    .orderBy(desc(schema.projects.deletedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, deletedAt: r.deletedAt as Date }));
}

export async function restoreProject(opts: {
  projectId: string;
  actorId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, opts.projectId),
        isNotNull(schema.projects.deletedAt)
      )
    )
    .limit(1);
  if (!row) return false;

  await db
    .update(schema.projects)
    .set({ deletedAt: null, deletedByUserId: null })
    .where(eq(schema.projects.id, opts.projectId));

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "project.restore",
    targetType: "project",
    targetId: opts.projectId,
  });
  return true;
}
