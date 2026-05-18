import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

/**
 * Look up a user's stored GitHub OAuth access token.
 *
 * Returns `null` when the user has not yet connected GitHub. Callers should
 * surface this as a "Connect GitHub first" UX flow rather than treating it
 * as an error.
 *
 * Token storage / refresh is handled by Neon Auth (Better Auth) — we just
 * read the latest value from the mirrored `neon_auth.account` table. If the
 * token has expired and a refresh token is available, Better Auth refreshes
 * it transparently on the next OAuth-aware call, so the value here is the
 * freshest persisted token.
 *
 * NOTE: We deliberately do not silently fall back to `process.env.GITHUB_PAT`
 * anymore. The shared-PAT model leaked one operator's access to every user
 * of the app — explicit per-user tokens are the only correct shape for
 * multi-tenant use.
 */
export async function getUserGitHubAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select({ accessToken: schema.neonAccounts.accessToken })
    .from(schema.neonAccounts)
    .where(
      and(
        // memberships.user_id is text but neon_auth.account.userId is also
        // text (Better Auth stores user IDs as text in its account table),
        // so no cast is needed here — unlike the user-join case.
        eq(schema.neonAccounts.userId, userId),
        eq(schema.neonAccounts.providerId, "github")
      )
    )
    // Defensive: if a user somehow has multiple github rows (re-link), take
    // the freshest. Better Auth normally upserts so we expect at most one.
    .orderBy(sql`${schema.neonAccounts.updatedAt} DESC`)
    .limit(1);

  return rows[0]?.accessToken ?? null;
}

/**
 * Light wrapper that throws a structured error suitable for surfacing as
 * 412 PRECONDITION_FAILED in API routes.
 */
export class GitHubNotConnectedError extends Error {
  status = 412;
  code = "GITHUB_NOT_CONNECTED";
  constructor() {
    super("GitHub account is not connected. Connect it from Account settings.");
    this.name = "GitHubNotConnectedError";
  }
}

export async function requireUserGitHubAccessToken(userId: string): Promise<string> {
  const token = await getUserGitHubAccessToken(userId);
  if (!token) throw new GitHubNotConnectedError();
  return token;
}
