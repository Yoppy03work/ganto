"use client";
import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Singleton Neon Auth client. Use from Client Components only.
 *
 * Methods exposed (Better Auth API):
 *   authClient.signIn.email({ email, password })
 *   authClient.signIn.social({ provider: 'google', callbackURL: '/' })
 *   authClient.signUp.email({ email, password, name })
 *   authClient.getSession()
 *   authClient.signOut()
 */
export const authClient = createAuthClient();
