import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

// Run Neon Auth's middleware once and reuse on every request.
const neonMiddleware = auth.middleware({ loginUrl: "/login" });

// Paths that bypass auth entirely (rendered without a session).
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/invite/", // /invite/[token]
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
