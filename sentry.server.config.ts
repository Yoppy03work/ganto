/**
 * Sentry server-side init (Node runtime).
 *
 * Loaded via `instrumentation.ts` when NEXT_RUNTIME === "nodejs".
 *
 * Policy:
 *  - production: always send, sample rate 0.2
 *  - preview (Vercel): always send, sample rate 1.0
 *  - dev: disabled unless SENTRY_TEST_MODE=true
 *  - PII scrub: drops cookies, auth headers, user.email before sending
 */
import * as Sentry from "@sentry/nextjs";
import { applySentryCommonConfig } from "./lib/observability/sentry-shared";

applySentryCommonConfig(Sentry, "server");
