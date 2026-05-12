import "server-only";
import { db, schema } from "@/db/client";

export type AuditEntry = {
  projectId: string | null;
  actorId: string | null;
  action: string; // dotted: 'project.create', 'task.update', etc.
  targetType: string; // 'project' | 'task' | 'role' | 'membership' | ...
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Insert one audit entry. Caller decides what's in before/after. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    projectId: entry.projectId ?? null,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    before: (entry.before ?? null) as unknown as object,
    after: (entry.after ?? null) as unknown as object,
  });
}
