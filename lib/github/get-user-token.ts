import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

/**
 * Look up the current ganto user's GitHub OAuth access token from our own
 * `github_user_tokens` table.
 *
 * History: we previously tried to pull this from `neon_auth.account` (Better
 * Auth's linked-provider table) so Neon Auth's refresh path would kick in
 * transparently. That path didn't work end-to-end for custom GitHub keys
 * in proxy mode — the state cookie set during linkSocial never made it back
 * to Neon's backend on the callback hop (cross-domain). We now run our own
 * OAuth dance in /api/github/oauth/*, on a single domain, so the state
 * cookie + token storage are both in our control.
 *
 * Returns `null` when the user has not yet linked GitHub — surface this in
 * the UI as a "Connect GitHub first" prompt.
 *
 * Optional refresh: this implementation does NOT auto-refresh expired
 * tokens. GitHub OAuth Apps issue long-lived tokens by default; if your App
 * is configured for short-lived tokens with refresh tokens, add a refresh
 * step here using `refreshToken` + `expiresAt`.
 */
export async function getUserGitHubAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select({
      accessToken: schema.githubUserTokens.accessToken,
      expiresAt: schema.githubUserTokens.expiresAt,
    })
    .from(schema.githubUserTokens)
    .where(eq(schema.githubUserTokens.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.accessToken) return null;
  // Treat an expired token as "not connected" so the UI prompts a re-link
  // rather than us shipping a stale token to GitHub and failing later.
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return row.accessToken;
}

/**
 * Read-only "is the user connected?" + lightweight metadata for the UI.
 */
export type GitHubConnection = {
  connected: boolean;
  githubLogin: string | null;
  scope: string | null;
  connectedAt: Date | null;
};

export async function getGitHubConnection(userId: string): Promise<GitHubConnection> {
  const rows = await db
    .select({
      githubLogin: schema.githubUserTokens.githubLogin,
      scope: schema.githubUserTokens.scope,
      createdAt: schema.githubUserTokens.createdAt,
      expiresAt: schema.githubUserTokens.expiresAt,
    })
    .from(schema.githubUserTokens)
    .where(
      and(
        eq(schema.githubUserTokens.userId, userId),
        // Treat already-expired rows as not connected.
        sql`(${schema.githubUserTokens.expiresAt} IS NULL OR ${schema.githubUserTokens.expiresAt} > NOW())`
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { connected: false, githubLogin: null, scope: null, connectedAt: null };
  }
  return {
    connected: true,
    githubLogin: row.githubLogin,
    scope: row.scope,
    connectedAt: row.createdAt,
  };
}

/**
 * Structured error for surfacing 412 PRECONDITION_FAILED in API routes when
 * a sync requires a GitHub connection.
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
