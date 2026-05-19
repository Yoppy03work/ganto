import "server-only";
import { eq, and, count, sql, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type ProjectMember = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  status: "active" | "suspended";
  joinedAt: Date;
  roleId: string;
  roleName: string;
  taskCount: number;
  /** Optimistic concurrency token for the membership row. */
  lockVersion: number;
};

/** List active+suspended members of a project, joined to neon_auth.user. */
export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  // memberships.user_id is text (we don't FK to neon_auth.user) while
  // neon_auth.user.id is uuid. PostgreSQL won't implicitly compare text=uuid,
  // so cast explicitly in the join condition.
  const rows = await db
    .select({
      userId: schema.memberships.userId,
      status: schema.memberships.status,
      joinedAt: schema.memberships.joinedAt,
      roleId: schema.roles.id,
      roleName: schema.roles.name,
      name: schema.neonUsers.name,
      email: schema.neonUsers.email,
      image: schema.neonUsers.image,
      lockVersion: schema.memberships.lockVersion,
    })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .leftJoin(
      schema.neonUsers,
      sql`${schema.memberships.userId}::uuid = ${schema.neonUsers.id}`
    )
    .where(eq(schema.memberships.projectId, projectId));

  // Per-member task assignment count (active tasks only — Trash entries
  // shouldn't inflate someone's workload number on the Members panel).
  const taskCounts = await db
    .select({
      userId: schema.taskAssignees.userId,
      n: count(schema.taskAssignees.taskId),
    })
    .from(schema.taskAssignees)
    .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskAssignees.taskId))
    .where(
      and(
        eq(schema.tasks.projectId, projectId),
        isNull(schema.tasks.deletedAt)
      )
    )
    .groupBy(schema.taskAssignees.userId);
  const tcMap = new Map(taskCounts.map((r) => [r.userId, Number(r.n)]));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? "(unknown)",
    email: r.email ?? "",
    image: r.image ?? null,
    status: r.status as "active" | "suspended",
    joinedAt: r.joinedAt,
    roleId: r.roleId,
    roleName: r.roleName,
    taskCount: tcMap.get(r.userId) ?? 0,
    lockVersion: r.lockVersion,
  }));
}

/** List the roles defined for a project (cloned built-ins + any custom). */
export async function listProjectRoles(projectId: string) {
  return db
    .select({
      id: schema.roles.id,
      name: schema.roles.name,
      description: schema.roles.description,
      isBuiltin: schema.roles.isBuiltin,
      position: schema.roles.position,
    })
    .from(schema.roles)
    .where(eq(schema.roles.projectId, projectId))
    .orderBy(schema.roles.position);
}

/** Look up the (active) membership of a user in a project. */
export async function getMembership(userId: string, projectId: string) {
  const rows = await db
    .select({
      id: schema.memberships.id,
      roleId: schema.memberships.roleId,
      roleName: schema.roles.name,
      status: schema.memberships.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.projectId, projectId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
