import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  buildAuthorizeUrl,
  randomState,
  stateCookieOptions,
} from "@/lib/github/oauth";

export const runtime = "nodejs";

/**
 * Kick off GitHub OAuth. Generates a fresh CSRF state token, stores it in
 * an HttpOnly cookie on ganto's own domain (so it round-trips back to us
 * — not to a third-party domain), and 302s the browser to GitHub.
 *
 * Triggered from the /account "Connect GitHub" link, served as a server
 * route rather than a Server Action so we can return a real redirect.
 */
export async function GET() {
  // Must be logged in — the eventual token gets stored against this user.
  await requireCurrentUser();

  const state = randomState();
  const url = buildAuthorizeUrl(state);
  const cookie = stateCookieOptions();
  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set(cookie.name, state, {
    maxAge: cookie.maxAge,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    path: cookie.path,
  });
  return res;
}
