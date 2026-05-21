import "server-only";
import { and, eq, isNull, asc } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type MyTaskRow = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
};

/**
 * Tasks assigned to a user across ALL their projects. Used by the cross-project
 * "My tasks" view. Assignees always see their own tasks regardless of
 * visibility, so no visibility filter is applied. Soft-deleted tasks excluded.
 */
export async function listMyTasks(userId: string): Promise<MyTaskRow[]> {
  const rows = await db
    .select({
      id: schema.tasks.id,
      projectId: schema.tasks.projectId,
      projectName: schema.projects.name,
      title: schema.tasks.title,
      status: schema.tasks.status,
      startAt: schema.tasks.startAt,
      endAt: schema.tasks.endAt,
    })
    .from(schema.taskAssignees)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskAssignees.taskId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
    // Scope to projects the user CURRENTLY belongs to. Member removal deletes
    // the membership but leaves task_assignee rows, so without this join a
    // removed user keeps seeing task titles/dates from that project.
    .innerJoin(
      schema.memberships,
      and(
        eq(schema.memberships.projectId, schema.tasks.projectId),
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.status, "active")
      )
    )
    .where(
      and(
        eq(schema.taskAssignees.userId, userId),
        isNull(schema.tasks.deletedAt),
        // Hide tasks from soft-deleted (trashed) projects — those project pages
        // already 404, so the list must not link to them until restore.
        isNull(schema.projects.deletedAt)
      )
    )
    .orderBy(asc(schema.tasks.endAt));
  return rows;
}
