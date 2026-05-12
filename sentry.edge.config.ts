/**
 * Sentry edge-runtime init. Loaded via `instrumentation.ts` when
 * NEXT_RUNTIME === "edge".
 */
import * as Sentry from "@sentry/nextjs";
import { applySentryCommonConfig } from "./lib/observability/sentry-shared";

applySentryCommonConfig(Sentry, "edge");
