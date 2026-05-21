import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { recordAudit } from "@/lib/audit/log";

export type ShareTokenRow = {
  id: string;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export async function listShareTokens(projectId: string): Promise<ShareTokenRow[]> {
  return db
    .select({
      id: schema.shareTokens.id,
      token: schema.shareTokens.token,
      expiresAt: schema.shareTokens.expiresAt,
      createdAt: schema.shareTokens.createdAt,
    })
    .from(schema.shareTokens)
    .where(eq(schema.shareTokens.projectId, projectId));
}

export async function createShareToken(opts: {
  projectId: string;
  actorId: string;
  expiresAt?: Date | null;
}): Promise<{ id: string; token: string; createdAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(schema.shareTokens)
    .values({
      projectId: opts.projectId,
      token,
      createdBy: opts.actorId,
      expiresAt: opts.expiresAt ?? null,
    })
    .returning({ id: schema.shareTokens.id, createdAt: schema.shareTokens.createdAt });
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "share.create",
    targetType: "project",
    targetId: opts.projectId,
  });
  return { id: row.id, token, createdAt: row.createdAt };
}

export async function revokeShareToken(opts: {
  projectId: string;
  tokenId: string;
  actorId: string;
}): Promise<void> {
  await db
    .delete(schema.shareTokens)
    .where(
      and(
        eq(schema.shareTokens.id, opts.tokenId),
        eq(schema.shareTokens.projectId, opts.projectId)
      )
    );
  await recordAudit({
    projectId: opts.projectId,
    actorId: opts.actorId,
    action: "share.revoke",
    targetType: "project",
    targetId: opts.projectId,
  });
}

/**
 * Resolve a share token to its project id, honoring expiry. Returns null when
 * the token is unknown or expired. NO AUTH — this is the public read path.
 */
export async function resolveShareToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({
      projectId: schema.shareTokens.projectId,
      expiresAt: schema.shareTokens.expiresAt,
    })
    .from(schema.shareTokens)
    .where(eq(schema.shareTokens.token, token))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return row.projectId;
}
