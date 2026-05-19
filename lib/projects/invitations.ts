import "server-only";
import { eq, and, isNull, desc, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

/**
 * Neon Auth syncs sign-ups into neon_auth.user asynchronously. Right after a
 * fresh signup → invite accept, our member-list JOIN can briefly find no
 * matching row. Poll for up to ~1s before returning so the page that
 * follows the redirect renders a complete row.
 */
async function waitForUserSync(userId: string, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await db
      .select({ id: schema.neonUsers.id })
      .from(schema.neonUsers)
      .where(sql`${schema.neonUsers.id} = ${userId}::uuid`)
      .limit(1);
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** URL-safe random invite token. */
function newInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const INVITE_TTL_DAYS = 14;

export type CreateInviteResult = {
  id: string;
  token: string;
  url: string;
  roleId: string;
  expiresAt: Date;
};

export async function createInvitation(opts: {
  projectId: string;
  roleId: string;
  email?: string | null;
  invitedBy: string;
  appUrl: string;
}): Promise<CreateInviteResult> {
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(schema.invitations)
    .values({
      projectId: opts.projectId,
      token,
      roleId: opts.roleId,
      email: opts.email ?? null,
      invitedBy: opts.invitedBy,
      expiresAt,
    })
    .returning({ id: schema.invitations.id });

  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.invitedBy,
    action: "invitation.create",
    targetType: "invitation",
    targetId: row.id,
    after: { roleId: opts.roleId, email: opts.email ?? null },
  });

  return {
    id: row.id,
    token,
    url: `${opts.appUrl.replace(/\/$/, "")}/invite/${token}`,
    roleId: opts.roleId,
    expiresAt,
  };
}

/** List pending (unused, unexpired) invitations for a project. */
export async function listPendingInvitations(projectId: string) {
  const now = new Date();
  return db
    .select({
      id: schema.invitations.id,
      token: schema.invitations.token,
      email: schema.invitations.email,
      roleId: schema.invitations.roleId,
      roleName: schema.roles.name,
      invitedBy: schema.invitations.invitedBy,
      createdAt: schema.invitations.createdAt,
      expiresAt: schema.invitations.expiresAt,
    })
    .from(schema.invitations)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
    .where(
      and(
        eq(schema.invitations.projectId, projectId),
        isNull(schema.invitations.usedAt),
        gt(schema.invitations.expiresAt, now)
      )
    )
    .orderBy(desc(schema.invitations.createdAt));
}

/** Resolve an invite token: returns null if missing, expired, or already used. */
export async function resolveInvitation(token: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: schema.invitations.id,
      projectId: schema.invitations.projectId,
      projectName: schema.projects.name,
      roleId: schema.invitations.roleId,
      roleName: schema.roles.name,
      email: schema.invitations.email,
      expiresAt: schema.invitations.expiresAt,
      usedAt: schema.invitations.usedAt,
    })
    .from(schema.invitations)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.invitations.projectId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
    .where(eq(schema.invitations.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.usedAt) return { ...row, status: "used" as const };
  if (row.expiresAt && row.expiresAt < now) return { ...row, status: "expired" as const };
  return { ...row, status: "pending" as const };
}

/**
 * Accept an invite for the current user. If they're already a member, this
 * is a no-op (and the invitation stays unused so others can use it if it's
 * a public link). If the invite is single-use it is marked consumed.
 */
export async function acceptInvitation(opts: {
  token: string;
  userId: string;
}): Promise<
  | { ok: true; projectId: string; alreadyMember: boolean }
  | { ok: false; reason: "missing" | "expired" | "used" }
> {
  const inv = await resolveInvitation(opts.token);
  if (!inv) return { ok: false, reason: "missing" };
  if (inv.status === "expired") return { ok: false, reason: "expired" };
  if (inv.status === "used") return { ok: false, reason: "used" };

  const existing = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.projectId, inv.projectId),
        eq(schema.memberships.userId, opts.userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { ok: true, projectId: inv.projectId, alreadyMember: true };
  }

  // Wait for the user row to appear in neon_auth.user before inserting the
  // membership so any subsequent JOIN sees a complete record.
  await waitForUserSync(opts.userId);

  await db.insert(schema.memberships).values({
    projectId: inv.projectId,
    userId: opts.userId,
    roleId: inv.roleId,
    status: "active",
  });

  // Mark the invite as used only if it was email-targeted (single use).
  // Public links (email IS NULL) stay reusable until expiry.
  if (inv.email) {
    await db
      .update(schema.invitations)
      .set({ usedAt: new Date(), usedBy: opts.userId })
      .where(eq(schema.invitations.id, inv.id));
  }

  await recordAudit({
    projectId: inv.projectId,
    actorId: opts.userId,
    action: "membership.create",
    targetType: "membership",
    after: { roleId: inv.roleId, viaInvite: inv.id },
  });

  return { ok: true, projectId: inv.projectId, alreadyMember: false };
}
