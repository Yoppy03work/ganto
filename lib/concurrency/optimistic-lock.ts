/**
 * Optimistic concurrency control utilities.
 *
 * The pattern: every PATCH-able row carries an integer `lockVersion`. Clients
 * read the row, hold onto its `lockVersion`, and pass it back as
 * `expectedLockVersion` in the next mutation. Server compares — if the row
 * has been bumped by someone else in the meantime, the WHERE clause matches
 * zero rows and we surface that as 409 Conflict.
 *
 * Why integer instead of `updated_at`? Timestamps round-trip through JSON
 * with precision loss (TZ, ms vs µs, JS Date <-> Drizzle), so equality
 * comparisons are brittle. A monotonically-increasing integer has no such
 * pitfalls.
 */

import { z } from "zod";

/** Thrown when an UPDATE's `lockVersion` predicate matches zero rows. */
export class ConflictError extends Error {
  status = 409;
  code = "OPTIMISTIC_LOCK_CONFLICT";
  constructor(message = "Resource was modified concurrently") {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Verify that an UPDATE ... RETURNING actually changed a row.
 *
 *   const updated = await db.update(...).set(...).where(...).returning();
 *   ensureUpdated(updated);
 *
 * Throws ConflictError if updated.length === 0.
 */
export function ensureUpdated<T>(updated: ArrayLike<T>): void {
  if (updated.length === 0) throw new ConflictError();
}

/**
 * Zod schema fragment for PATCH bodies. Mix into route-level schemas like:
 *
 *   const PatchTask = z.object({
 *     title: z.string().optional(),
 *     ...
 *   }).merge(expectedLockVersionSchema);
 */
export const expectedLockVersionSchema = z.object({
  expectedLockVersion: z.number().int().nonnegative({
    message: "expectedLockVersion is required and must be a non-negative integer",
  }),
});

/**
 * Translate a thrown ConflictError into a Next.js Response with our standard
 * 409 JSON shape. Use this inside a route's try/catch:
 *
 *   try { ... } catch (e) {
 *     const conflict = conflictResponse(e);
 *     if (conflict) return conflict;
 *     throw e; // bubble up to the framework / Sentry
 *   }
 */
export function conflictResponse(err: unknown): Response | null {
  if (err instanceof ConflictError) {
    return new Response(
      JSON.stringify({
        error: err.message,
        code: err.code,
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  return null;
}

/**
 * Translate a Zod validation error specifically for a missing / invalid
 * `expectedLockVersion` field into a 400 response. Other validation failures
 * should be handled by the caller's normal Zod handling.
 *
 * Returns null if the error isn't about expectedLockVersion.
 */
export function missingLockVersionResponse(err: unknown): Response | null {
  if (!(err instanceof z.ZodError)) return null;
  const lockVersionIssue = err.issues.find(
    (i) => i.path.length === 1 && i.path[0] === "expectedLockVersion"
  );
  if (!lockVersionIssue) return null;
  return new Response(
    JSON.stringify({
      error: lockVersionIssue.message,
      code: "MISSING_LOCK_VERSION",
    }),
    {
      status: 400,
      headers: { "Content-Type": "application/json" },
    }
  );
}
