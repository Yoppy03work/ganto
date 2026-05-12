import { auth } from "@/lib/auth/server";

/**
 * Mount the Neon Auth REST API at /api/auth/*. The SDK proxies all sign-up,
 * sign-in, OAuth, session, and account endpoints through this single route.
 */
export const { GET, POST } = auth.handler();
