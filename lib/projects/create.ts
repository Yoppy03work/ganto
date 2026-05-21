import "server-only";
import { isNull, eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { seedSampleTasks } from "./sample-tasks";

/**
 * Create a new project, clone built-in role templates into project-scoped
 * roles (so the owner can edit/extend them per-project), then add the creator
 * as a member with the cloned Owner role.
 *
 * All steps run sequentially against Neon's HTTP driver. Drizzle's
 * `db.transaction()` is not supported on the HTTP driver, but each step here
 * is idempotent enough to recover from partial failures (the unique
 * constraints will reject re-runs once a project has been created).
 */
export async function createProject(opts: {
  userId: string;
  name: string;
  description?: string | null;
  storageMode?: "local" | "github";
}): Promise<{ projectId: string; ownerRoleId: string }> {
  // 1) Insert the project row.
  const [project] = await db
    .insert(schema.projects)
    .values({
      name: opts.name,
      description: opts.description ?? null,
      storageMode: opts.storageMode ?? "local",
      createdBy: opts.userId,
    })
    .returning({ id: schema.projects.id });
  const projectId = project.id;

  // 2) Load all built-in role templates (project_id IS NULL) plus their permissions.
  const templates = await db
    .select()
    .from(schema.roles)
    .where(isNull(schema.roles.projectId));
  const templateIds = templates.map((r) => r.id);
  const templatePerms = templateIds.length
    ? await db
        .select()
        .from(schema.permissions)
        .where(inArray(schema.permissions.roleId, templateIds))
    : [];
  const permsByTemplate = new Map<string, typeof templatePerms>();
  for (const p of templatePerms) {
    const list = permsByTemplate.get(p.roleId) ?? [];
    list.push(p);
    permsByTemplate.set(p.roleId, list);
  }

  // 3) Clone each template into a project-scoped role + its permissions.
  const cloned: { templateId: string; clonedId: string; name: string }[] = [];
  for (const t of templates) {
    const [r] = await db
      .insert(schema.roles)
      .values({
        projectId,
        name: t.name,
        description: t.description,
        isBuiltin: true,
        position: t.position,
      })
      .returning({ id: schema.roles.id });
    cloned.push({ templateId: t.id, clonedId: r.id, name: t.name });

    const perms = permsByTemplate.get(t.id) ?? [];
    if (perms.length) {
      await db.insert(schema.permissions).values(
        perms.map((p) => ({
          roleId: r.id,
          capability: p.capability,
          scope: p.scope,
        }))
      );
    }
  }

  const ownerRole = cloned.find((c) => c.name === "Owner");
  if (!ownerRole) {
    throw new Error("Owner role template missing — run `pnpm db:seed`");
  }

  // 4) Add the creator as Owner.
  await db.insert(schema.memberships).values({
    projectId,
    userId: opts.userId,
    roleId: ownerRole.clonedId,
    status: "active",
  });

  // 5) Audit.
  await recordAudit({
    projectId,
    actorId: opts.userId,
    action: "project.create",
    targetType: "project",
    targetId: projectId,
    after: {
      name: opts.name,
      description: opts.description ?? null,
      storageMode: opts.storageMode ?? "local",
    },
  });

  // 6) Seed sample tasks so the Gantt isn't empty on first visit.
  // Only for local-mode projects; GitHub-backed pulls from the connected project.
  if ((opts.storageMode ?? "local") === "local") {
    await seedSampleTasks({ projectId, createdBy: opts.userId });
  }

  return { projectId, ownerRoleId: ownerRole.clonedId };
}

/** List projects the user is a member of, ordered by most recently joined. */
export async function listProjectsForUser(userId: string) {
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      description: schema.projects.description,
      storageMode: schema.projects.storageMode,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
      roleName: schema.roles.name,
      memberStatus: schema.memberships.status,
      joinedAt: schema.memberships.joinedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.memberships.projectId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.userId, userId),
        // Hide soft-deleted projects from the list / switcher.
        isNull(schema.projects.deletedAt)
      )
    );

  // newest-joined first
  rows.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
  return rows;
}
