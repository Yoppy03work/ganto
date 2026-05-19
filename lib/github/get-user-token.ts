import "server-only";
import { auth } from "@/lib/auth/server";

/**
 * Retrieve the current session user's GitHub OAuth access token via Neon Auth
 * (Better Auth) so that any expired token gets transparently refreshed using
 * the stored refresh token before being handed off to the GitHub API client.
 *
 * Why not read `neon_auth.account.accessToken` directly?
 *   - It would bypass Better Auth's refresh path. If a provider hands out
 *     short-lived tokens (or rotates them), every pull/push would keep sending
 *     a stale token to GitHub GraphQL and fail until the user re-links.
 *   - GitHub OAuth Apps typically issue long-lived tokens today, but
 *     fine-grained tokens / future provider changes can introduce expiry —
 *     the safe behaviour is to route through the auth backend.
 *
 * Returns `null` when the user has not yet connected GitHub. Callers should
 * surface this as a "Connect GitHub first" UX flow rather than an error.
 *
 * NOTE: Relies on the current session cookie (Neon Auth reads from
 * `next/headers` internally). Call only from contexts where a session is
 * established — i.e. after `requireCurrentUser()` in API routes / Server
 * Components.
 */
export async function getUserGitHubAccessToken(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (auth as any).getAccessToken({ providerId: "github" });
  const data = res?.data as { accessToken?: string } | undefined;
  const errObj = res?.error;
  if (errObj || !data?.accessToken) return null;
  return data.accessToken;
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

export async function requireUserGitHubAccessToken(): Promise<string> {
  const token = await getUserGitHubAccessToken();
  if (!token) throw new GitHubNotConnectedError();
  return token;
}
