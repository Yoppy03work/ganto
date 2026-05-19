/**
 * Next.js instrumentation entry. Routes Sentry init to the right runtime.
 *
 * Also wires `onRequestError` so server-side route-handler errors get
 * forwarded to Sentry automatically (Next 15+).
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
