/**
 * Client-side Sentry init. Next 15.3+ picks this file up automatically and
 * runs it after document load, before React hydration.
 */
import * as Sentry from "@sentry/nextjs";
import { applySentryCommonConfig } from "./lib/observability/sentry-shared";

applySentryCommonConfig(Sentry, "client");

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
