import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Wrap with Sentry only when SENTRY_AUTH_TOKEN is available (source-maps
// upload), or when DSN is configured. Otherwise pass through untouched so
// local dev doesn't need any Sentry setup.
const hasSentry =
  Boolean(process.env.SENTRY_AUTH_TOKEN) ||
  Boolean(process.env.SENTRY_DSN) ||
  Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export default hasSentry
  ? withSentryConfig(nextConfig, {
      // Suppress all Sentry CLI logs in CI / production build output unless
      // explicitly enabled with SENTRY_VERBOSE_BUILD.
      silent: process.env.SENTRY_VERBOSE_BUILD !== "true",
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disableLogger: true,
      // Tunnel client events through our own origin to avoid being blocked
      // by ad-blockers
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
