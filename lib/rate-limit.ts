/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * SCOPE / LIMITATIONS: counters live in module memory, so the window is
 * per-serverless-instance, not global. Under heavy horizontal scaling an
 * attacker could get N× the limit (N = instance count). This is a deliberate
 * "good enough first layer" for brute-force slowdown without adding an
 * external dependency (Upstash / Vercel KV). For strong guarantees, swap the
 * Map for a shared store behind the same `check()` interface.
 *
 * Fail-open by construction: if anything throws, callers should allow the
 * request (auth availability > strict limiting).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

// Opportunistic cleanup so the Map doesn't grow unbounded on a long-lived
// instance. Runs at most once per minute, on access.
let lastSweep = 0;
export function sweepExpired(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}
