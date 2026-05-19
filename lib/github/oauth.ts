import "server-only";
import { randomBytes } from "node:crypto";

/**
 * GitHub OAuth client-side flow utilities for ganto's own GitHub OAuth App.
 *
 * We run our own GitHub OAuth because Neon Auth's proxy + custom-OAuth-keys
 * path doesn't reliably preserve the state cookie across the cross-domain
 * callback hop. Doing it inside ganto keeps the whole flow on a single
 * domain (ganto-seven.vercel.app), so the state cookie set during /init is
 * naturally present during /callback.
 *
 * Reads:
 *  - GITHUB_OAUTH_CLIENT_ID
 *  - GITHUB_OAUTH_CLIENT_SECRET
 *  - APP_URL (used to build redirect_uri)
 *
 * State cookie:
 *  - Name: `gh_oauth_state`
 *  - HttpOnly, SameSite=Lax (must survive top-level redirect from GitHub),
 *    Secure in production
 *  - 10-minute lifetime — plenty for the OAuth dance, short enough to not
 *    linger if abandoned
 */

export const GH_STATE_COOKIE = "gh_oauth_state";
const STATE_TTL_SECONDS = 60 * 10;

/** Scopes we ask for. `read:project` + `project` cover Projects v2 R/W. */
export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email", "read:project", "project"];

export function requireOauthEnv(): { clientId: string; clientSecret: string; appUrl: string } {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET are not set. Configure ganto's own GitHub OAuth App and add the env vars."
    );
  }
  if (!appUrl) {
    throw new Error("APP_URL is not set; cannot build OAuth redirect_uri.");
  }
  return { clientId, clientSecret, appUrl };
}

export function buildRedirectUri(): string {
  const { appUrl } = requireOauthEnv();
  // Trim trailing slash so we never produce "//api/...".
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/github/oauth/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId } = requireOauthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: buildRedirectUri(),
    scope: GITHUB_OAUTH_SCOPES.join(" "),
    state,
    // Force consent screen so re-linking shows the scopes the user is granting.
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function randomState(): string {
  // 32 bytes → 256 bits of entropy, base64url for cookie-safe transport.
  return randomBytes(32).toString("base64url");
}

export const stateCookieOptions = (): {
  name: string;
  maxAge: number;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
} => ({
  name: GH_STATE_COOKIE,
  maxAge: STATE_TTL_SECONDS,
  httpOnly: true,
  sameSite: "lax",
  // SameSite=Lax + Secure is the minimum for cookies to round-trip through
  // the GitHub redirect on modern browsers (Safari ITP especially).
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

export type GitHubTokenExchange = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
};

/** POST to GitHub to swap code for a token. Throws on non-2xx. */
export async function exchangeCodeForToken(code: string): Promise<GitHubTokenExchange> {
  const { clientId, clientSecret } = requireOauthEnv();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: buildRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as
    | GitHubTokenExchange
    | { error: string; error_description?: string };
  if ("error" in data) {
    throw new Error(
      `GitHub OAuth error: ${data.error}${
        data.error_description ? ` — ${data.error_description}` : ""
      }`
    );
  }
  if (!data.access_token) {
    throw new Error("GitHub token exchange returned no access_token");
  }
  return data;
}

export type GitHubUserInfo = {
  id: number;
  login: string;
};

/** Fetch the authenticated user's id + login. */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUserInfo> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /user fetch failed (${res.status})`);
  }
  const u = (await res.json()) as { id: number; login: string };
  return { id: u.id, login: u.login };
}
