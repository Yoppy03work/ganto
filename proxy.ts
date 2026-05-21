import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { checkRateLimit, sweepExpired } from "@/lib/rate-limit";

// Run Neon Auth's middleware once and reuse on every request.
const neonMiddleware = auth.middleware({ loginUrl: "/login" });

// Auth endpoints worth brute-force protection (matched as a path prefix on
// the proxied Neon Auth route). Window: 10 attempts / 5 min per IP+path.
const RATE_LIMITED_AUTH_PATHS = [
  "/api/auth/sign-in",
  "/api/auth/forget-password",
  "/api/auth/email-otp",
];
const RL_LIMIT = 10;
const RL_WINDOW_MS = 5 * 60_000;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}

// Paths that bypass auth entirely (rendered without a session).
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/invite/", // /invite/[token]
  "/share/", // /share/[token] — read-only public Gantt
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets pass through.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // Brute-force protection on auth POST endpoints, applied before the bypass.
  // Fail-open: any error here must not block legitimate auth.
  if (
    req.method === "POST" &&
    RATE_LIMITED_AUTH_PATHS.some((p) => pathname.startsWith(p))
  ) {
    try {
      sweepExpired();
      const key = `${clientIp(req)}:${pathname}`;
      const { allowed, retryAfterSec } = checkRateLimit(key, RL_LIMIT, RL_WINDOW_MS);
      if (!allowed) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
        );
      }
    } catch {
      // ignore — never block auth on limiter failure
    }
  }

  // All API routes (including /api/auth/*) bypass page-level middleware.
  // Each route handler enforces auth itself via requireCurrentUser(), and
  // /api/auth/* is the Neon Auth handler which manages its own session
  // lifecycle. The Neon Auth Beta middleware misroutes some POST API requests
  // through the login-redirect path even with a valid session, so doing it
  // here keeps API responses as JSON instead of HTML redirects.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Hand page requests off to Neon Auth's middleware. It validates the signed
  // session cookie, refreshes tokens when needed, and redirects to loginUrl.
  return neonMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
