/**
 * Shared Sentry init logic for server / edge / client.
 *
 * Single source of truth for:
 *  - DSN selection
 *  - environment + release tagging
 *  - sample-rate policy
 *  - dev opt-in via SENTRY_TEST_MODE
 *  - PII scrub
 *
 * Imported by sentry.server.config.ts, sentry.edge.config.ts, and
 * instrumentation-client.ts so all three runtimes behave identically.
 */
import type * as SentryT from "@sentry/nextjs";

type Runtime = "server" | "edge" | "client";

/**
 * Decide whether Sentry should send events at all in this process.
 *
 *  - Vercel preview / production: always enabled (DSN may be missing in dev)
 *  - Anywhere else: only enabled when SENTRY_TEST_MODE === "true"
 *
 * Returns false if no DSN is configured — Sentry would error otherwise.
 */
export function shouldEnableSentry(runtime: Runtime): boolean {
  const dsn =
    runtime === "client"
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;

  const vercelEnv = process.env.VERCEL_ENV; // "production" | "preview" | "development"
  if (vercelEnv === "production" || vercelEnv === "preview") return true;

  // Local dev: opt-in only
  return process.env.SENTRY_TEST_MODE === "true";
}

function getSampleRate(): number {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return 0.2;
  if (vercelEnv === "preview") return 1.0;
  // dev (only reached when SENTRY_TEST_MODE=true)
  return 1.0;
}

/** Mask anything that looks like an email address. */
function maskEmail(s: string): string {
  return s.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[email-redacted]"
  );
}

/**
 * Strip PII from an event before it leaves the process.
 *
 *  - drops cookies + auth headers
 *  - drops user.email (keeps user.id for correlation)
 *  - masks emails embedded in error messages
 */
function scrubPii<T extends SentryT.ErrorEvent>(event: T): T {
  if (event.request) {
    const req = event.request as { cookies?: unknown; headers?: Record<string, unknown> };
    delete req.cookies;
    if (req.headers) {
      delete req.headers.authorization;
      delete req.headers.cookie;
      delete req.headers["set-cookie"];
    }
  }
  if (event.user) {
    delete (event.user as { email?: string }).email;
    delete (event.user as { ip_address?: string }).ip_address;
  }
  if (event.message) event.message = maskEmail(event.message);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = maskEmail(ex.value);
    }
  }
  return event;
}

/**
 * Apply our standard Sentry config. Call from each runtime's init file.
 */
export function applySentryCommonConfig(
  Sentry: typeof SentryT,
  runtime: Runtime
): void {
  if (!shouldEnableSentry(runtime)) return;

  const dsn =
    runtime === "client"
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    release:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.SENTRY_RELEASE ??
      undefined,
    tracesSampleRate: getSampleRate(),
    sendDefaultPii: false,
    beforeSend: scrubPii,
  });
}
