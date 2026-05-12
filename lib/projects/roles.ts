import "server-only";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";
import { ensureUpdated } from "@/lib/concurrency/optimistic-lock";

/** All capabilities the app understands. Used to populate the role-creation UI. */
export const ALL_CAPABILITIES: ReadonlyArray<{
  capability: string;
  label: string;
  ownScopeAllowed: boolean;
}> = [
  { capability: "task.view.all",       label: "View public tasks",        ownScopeAllowed: false },
  { capability: "task.view.member",    label: "View member-only tasks",   ownScopeAllowed: false },
  { capability: "task.view.private",   label: "View private tasks",       ownScopeAllowed: false },
  { capability: "task.create",         label: "Create tasks",             ownScopeAllowed: false },
  { capability: "task.update",         label: "Edit any task",            ownScopeAllowed: true },
  { capability: "task.delete",         label: "Delete any task",          ownScopeAllowed: true },
  { capability: "member.invite",       label: "Invite members",           ownScopeAllowed: false },
  { capability: "member.remove",       label: "Remove members",           ownScopeAllowed: false },
  { capability: "member.role.change",  label: "Change member roles",      ownScopeAllowed: false },
  { capability: "role.create",         label: "Create custom roles",      ownScopeAllowed: false },
  { capability: "role.update",         label: "Edit roles",               ownScopeAllowed: false },
  { capability: "role.delete",         label: "Delete roles",             ownScopeAllowed: false },
  { capability: "project.settings",    label: "Edit project settings",    ownScopeAllowed: false },
  { capability: "project.delete",      label: "Delete project",           ownScopeAllowed: false },
];

export type CapabilityInput = {
  capability: string;
  scope: "all" | "own";
};

export async function listRoleCapabilities(roleId: string) {
  return db
    .select({ capability: schema.permissions.capability, scope: schema.permissions.scope })
    .from(schema.permissions)
    .where(eq(schema.permissions.roleId, roleId));
}

/** Create a new custom role + permissions for a project. */
export async function createCustomRole(opts: {
  projectId: string;
  actorId: string;
  name: string;
  description?: string | null;
  capabilities: CapabilityInput[];
}): Promise<{ id: string }> {
  const [role] = await db
    .insert(schema.roles)
    .values({
      projectId: opts.projectId,
      name: opts.name,
      description: opts.description ?? null,
      isBuiltin: false,
      // After Owner/Admin/Member/Viewer (10/20/30/40); custom roles slot in after them.
      position: 100,
    })
    .returning({ id: schema.roles.id });

  if (opts.capabilities.length) {
    await db.insert(schema.permissions).values(
      opts.capabilities.map((c) => ({
        roleId: role.id,
        capability: c.capability,
        scope: c.scope,
      }))
    );
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "role.create",
    targetType: "role",
    targetId: role.id,
    after: { name: opts.name, capabilities: opts.capabilities },
  });

  return { id: role.id };
}

/** Replace a custom role's name/description and capabilities. */
export async function updateCustomRole(opts: {
  projectId: string;
  roleId: string;
  actorId: string;
  /** Optimistic concurrency token from client's last read. */
  expectedLockVersion: number;
  name?: string;
  description?: string | null;
  capabilities?: CapabilityInput[];
}): Promise<{ lockVersion: number }> {
  // Pull current role to verify it's editable.
  const [current] = await db
    .select()
    .from(schema.roles)
    .where(and(eq(schema.roles.id, opts.roleId), eq(schema.roles.projectId, opts.projectId)))
    .limit(1);
  if (!current) throw new Error("Role not found in project");
  if (current.name === "Owner") throw new Error("Owner role cannot be edited");

  const before = {
    name: current.name,
    description: current.description,
    capabilities: await listRoleCapabilities(opts.roleId),
  };

  // Always bump lockVersion + verify expected version, even when only
  // capabilities are touched. This guarantees concurrent role edits are
  // caught regardless of which fields change.
  const updated = await db
    .update(schema.roles)
    .set({
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.description !== undefined ? { description: opts.description } : {}),
      lockVersion: sql`${schema.roles.lockVersion} + 1`,
    })
    .where(
      and(
        eq(schema.roles.id, opts.roleId),
        eq(schema.roles.lockVersion, opts.expectedLockVersion)
      )
    )
    .returning({ lockVersion: schema.roles.lockVersion });
  ensureUpdated(updated);

  if (opts.capabilities) {
    await db.delete(schema.permissions).where(eq(schema.permissions.roleId, opts.roleId));
    if (opts.capabilities.length) {
      await db.insert(schema.permissions).values(
        opts.capabilities.map((c) => ({
          roleId: opts.roleId,
          capability: c.capability,
          scope: c.scope,
        }))
      );
    }
  }

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "role.update",
    targetType: "role",
    targetId: opts.roleId,
    before,
    after: {
      name: opts.name ?? current.name,
      description: opts.description ?? current.description,
      capabilities: opts.capabilities ?? before.capabilities,
    },
  });

  return { lockVersion: updated[0].lockVersion };
}

/** Delete a custom (non-builtin) role. Members on this role need to be re-roled first. */
export async function deleteCustomRole(opts: {
  projectId: string;
  roleId: string;
  actorId: string;
}): Promise<void> {
  const [current] = await db
    .select()
    .from(schema.roles)
    .where(and(eq(schema.roles.id, opts.roleId), eq(schema.roles.projectId, opts.projectId)))
    .limit(1);
  if (!current) throw new Error("Role not found in project");
  if (current.isBuiltin) throw new Error("Built-in roles cannot be deleted");

  // If anyone is on this role, refuse — caller should reassign first.
  const inUse = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(eq(schema.memberships.roleId, opts.roleId))
    .limit(1);
  if (inUse.length > 0) {
    throw new Error("Role is in use; reassign members first");
  }

  await db.delete(schema.roles).where(eq(schema.roles.id, opts.roleId));

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "role.delete",
    targetType: "role",
    targetId: opts.roleId,
    before: { name: current.name },
  });
}

/** Roles + their capabilities, suitable for the role editor UI. */
export async function listRolesWithCapabilities(projectId: string) {
  const roles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.projectId, projectId))
    .orderBy(schema.roles.position);
  if (roles.length === 0) return [];
  const ids = roles.map((r) => r.id);
  const perms = await db
    .select()
    .from(schema.permissions)
    .where(inArray(schema.permissions.roleId, ids));
  const byRole = new Map<string, { capability: string; scope: "all" | "own" }[]>();
  for (const p of perms) {
    const list = byRole.get(p.roleId) ?? [];
    list.push({ capability: p.capability, scope: p.scope });
    byRole.set(p.roleId, list);
  }
  return roles.map((r) => ({
    ...r,
    capabilities: byRole.get(r.id) ?? [],
  }));
}
