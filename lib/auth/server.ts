import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

if (!process.env.NEON_AUTH_BASE_URL) {
  console.warn("[auth] NEON_AUTH_BASE_URL is not set; auth calls will fail at runtime.");
}
if (!process.env.NEON_AUTH_COOKIE_SECRET) {
  console.warn("[auth] NEON_AUTH_COOKIE_SECRET is not set; auth calls will fail at runtime.");
}

/**
 * Singleton Neon Auth server instance.
 *
 * Provides:
 *   - Better Auth methods: auth.signIn / auth.signUp / auth.getSession / auth.signOut
 *   - auth.handler() — the Next.js API route handler (mount at /api/auth/[...path])
 *   - auth.middleware({ loginUrl }) — Next.js middleware/proxy function
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL ?? "",
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET ?? "",
    sessionDataTtl: 300, // 5 min in-cookie session cache
  },
});

/**
 * Get the current Neon Auth session in a Server Component or Route Handler.
 * Returns the typed session or null when not signed in.
 *
 * Usage in a Server Component:
 *   export const dynamic = 'force-dynamic';
 *   const session = await getSession();
 *   if (!session?.user) redirect('/login');
 */
export async function getSession() {
  const { data } = await auth.getSession();
  return data;
}

/** Convenience: pull just the current user (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/** Throw a 401 Response when called from a Route Handler without a session. */
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
