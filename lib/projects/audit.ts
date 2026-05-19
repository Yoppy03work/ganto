import "server-only";
import { eq, sql, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorImage: string | null;
};

/** Recent audit entries for a project, joined to the actor's name. */
export async function listProjectAudit(
  projectId: string,
  limit = 200
): Promise<AuditEntry[]> {
  const rows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      targetType: schema.auditLog.targetType,
      targetId: schema.auditLog.targetId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      createdAt: schema.auditLog.createdAt,
      actorId: schema.auditLog.actorId,
      actorName: schema.neonUsers.name,
      actorImage: schema.neonUsers.image,
    })
    .from(schema.auditLog)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.auditLog.actorId}::uuid = ${schema.neonUsers.id}`
    )
    .where(eq(schema.auditLog.projectId, projectId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    before: r.before,
    after: r.after,
    createdAt: r.createdAt,
    actorId: r.actorId,
    actorName: r.actorName,
    actorImage: r.actorImage,
  }));
}
