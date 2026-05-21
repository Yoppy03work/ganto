import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";

/**
 * Permission scope values. 'all' means the capability covers any target;
 * 'own' means it covers only resources created/assigned to the actor.
 */
export type PermissionScope = "all" | "own";

export type EffectivePermission = {
  capability: string;
  scope: PermissionScope;
};

/**
 * Compute the set of capabilities a user has within a given project.
 * Returns null if the user is not a member, otherwise an array (possibly empty).
 *
 * The caller is expected to apply these against the action being attempted.
 * For 'own'-scoped capabilities, the caller must verify ownership separately.
 */
export type CapabilityOptions = {
  /**
   * When false (default), a soft-deleted (Trash) project resolves to no
   * permissions — i.e. every capability check fails, so no mutation or read
   * can target a trashed project. Only the restore flow passes `true`, since
   * it is the one operation that must act on a deleted project.
   */
  includeDeleted?: boolean;
};

export async function getMembershipPermissions(
  userId: string,
  projectId: string,
  opts?: CapabilityOptions
): Promise<{ roleId: string; roleName: string; permissions: EffectivePermission[] } | null> {
  const rows = await db
    .select({
      roleId: schema.memberships.roleId,
      roleName: schema.roles.name,
      capability: schema.permissions.capability,
      scope: schema.permissions.scope,
      status: schema.memberships.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    // Join the project so the capability gate also enforces "project is active".
    .innerJoin(schema.projects, eq(schema.projects.id, schema.memberships.projectId))
    .leftJoin(schema.permissions, eq(schema.permissions.roleId, schema.roles.id))
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.projectId, projectId),
        opts?.includeDeleted ? undefined : isNull(schema.projects.deletedAt)
      )
    );

  if (rows.length === 0) return null;
  if (rows[0].status !== "active") {
    return { roleId: rows[0].roleId, roleName: rows[0].roleName, permissions: [] };
  }

  const seen = new Set<string>();
  const permissions: EffectivePermission[] = [];
  for (const r of rows) {
    if (!r.capability) continue;
    const key = `${r.capability}:${r.scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    permissions.push({
      capability: r.capability,
      scope: (r.scope ?? "all") as PermissionScope,
    });
  }
  return { roleId: rows[0].roleId, roleName: rows[0].roleName, permissions };
}

/**
 * True if user has the given capability in the project.
 * For 'own'-scoped capabilities, callers should use `hasOwnedCapability`.
 */
export async function hasCapability(
  userId: string,
  projectId: string,
  capability: string,
  opts?: CapabilityOptions
): Promise<boolean> {
  const m = await getMembershipPermissions(userId, projectId, opts);
  if (!m) return false;
  return m.permissions.some(
    (p) => p.capability === capability && p.scope === "all"
  );
}

/**
 * True if user has the capability either with 'all' scope, or with 'own' scope
 * AND they own the resource.
 */
export async function hasCapabilityFor(
  userId: string,
  projectId: string,
  capability: string,
  isOwner: boolean,
  opts?: CapabilityOptions
): Promise<boolean> {
  const m = await getMembershipPermissions(userId, projectId, opts);
  if (!m) return false;
  return m.permissions.some(
    (p) =>
      p.capability === capability &&
      (p.scope === "all" || (p.scope === "own" && isOwner))
  );
}
