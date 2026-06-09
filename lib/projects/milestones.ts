import "server-only";
import { and, eq, sql, asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { ensureUpdated } from "@/lib/concurrency/optimistic-lock";

export type MilestoneRow = {
  id: string;
  title: string;
  date: Date;
  color: string | null;
  lockVersion: number;
};

export async function listProjectMilestones(
  projectId: string
): Promise<MilestoneRow[]> {
  const rows = await db
    .select({
      id: schema.milestones.id,
      title: schema.milestones.title,
      date: schema.milestones.date,
      color: schema.milestones.color,
      lockVersion: schema.milestones.lockVersion,
    })
    .from(schema.milestones)
    .where(eq(schema.milestones.projectId, projectId))
    .orderBy(asc(schema.milestones.date));
  return rows;
}

export async function createMilestone(opts: {
  projectId: string;
  actorId: string;
  title: string;
  date: Date;
  color?: string | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.milestones)
    .values({
      projectId: opts.projectId,
      title: opts.title,
      date: opts.date,
      color: opts.color ?? null,
      createdBy: opts.actorId,
    })
    .returning({ id: schema.milestones.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "milestone.create",
    targetType: "milestone",
    targetId: row.id,
    after: { title: opts.title, date: opts.date },
  });
  return { id: row.id };
}

export async function updateMilestone(opts: {
  projectId: string;
  milestoneId: string;
  actorId: string;
  expectedLockVersion: number;
  patch: { title?: string; date?: Date; color?: string | null };
}): Promise<{ lockVersion: number }> {
  const updated = await db
    .update(schema.milestones)
    .set({
      ...opts.patch,
      updatedAt: new Date(),
      lockVersion: sql`${schema.milestones.lockVersion} + 1`,
    })
    .where(
      and(
        eq(schema.milestones.id, opts.milestoneId),
        eq(schema.milestones.projectId, opts.projectId),
        eq(schema.milestones.lockVersion, opts.expectedLockVersion)
      )
    )
    .returning({ lockVersion: schema.milestones.lockVersion });
  ensureUpdated(updated);

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "milestone.update",
    targetType: "milestone",
    targetId: opts.milestoneId,
    after: opts.patch,
  });
  return { lockVersion: updated[0].lockVersion };
}

export async function deleteMilestone(opts: {
  projectId: string;
  milestoneId: string;
  actorId: string;
}): Promise<void> {
  await db
    .delete(schema.milestones)
    .where(
      and(
        eq(schema.milestones.id, opts.milestoneId),
        eq(schema.milestones.projectId, opts.projectId)
      )
    );
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "milestone.delete",
    targetType: "milestone",
    targetId: opts.milestoneId,
  });
}
