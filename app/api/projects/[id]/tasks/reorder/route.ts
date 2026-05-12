import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { hasCapability } from "@/lib/auth/permission";
import { recordAudit } from "@/lib/audit/log";
import {
  ConflictError,
  conflictResponse,
  ensureUpdated,
} from "@/lib/concurrency/optimistic-lock";

export const runtime = "nodejs";

/**
 * Required shape: `{ items: [{ taskId, expectedLockVersion }, ...] }`.
 *
 * The legacy `{ order: [...] }` shape was deliberately dropped — accepting
 * it would let any caller skip the optimistic-lock check, which is the
 * whole point of this endpoint's silent-data-loss protection. Clients are
 * all upgraded; old payloads now return 400 + `MISSING_LOCK_VERSION`.
 */
const ItemSchema = z.object({
  taskId: z.string().uuid(),
  expectedLockVersion: z.number().int().nonnegative({
    message: "expectedLockVersion is required",
  }),
});

const Input = z.object({
  items: z.array(ItemSchema).min(1).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const user = await requireCurrentUser();
  // Reorder counts as updating any task — require task.update with full scope.
  if (!(await hasCapability(user.id, projectId, "task.update"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    // Surface a dedicated 400 + code if the failure is specifically about
    // the new lockVersion shape — old clients posting `{ order: [...] }`
    // need a clear actionable error rather than a generic "Invalid input".
    const hasItemsError = parsed.error.issues.some(
      (i) => i.path[0] === "items"
    );
    if (hasItemsError) {
      return NextResponse.json(
        {
          error:
            "Reorder requires `items: [{ taskId, expectedLockVersion }, ...]`. The legacy `order` shape is no longer accepted.",
          code: "MISSING_LOCK_VERSION",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const items = parsed.data.items;
  const ids = items.map((i) => i.taskId);

  try {
    // Run the whole reorder inside one transaction. We pre-verify every task's
    // lockVersion matches, and only then bump positions. If ANY task fails the
    // check, the entire reorder is rolled back — no partial-success state
    // where half the rows have moved.
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: schema.tasks.id,
          lockVersion: schema.tasks.lockVersion,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, projectId),
            inArray(schema.tasks.id, ids),
            isNull(schema.tasks.deletedAt)
          )
        );
      if (rows.length !== ids.length) {
        // Throwing a generic Error rolls back the transaction; the catch
        // block below distinguishes our known cases.
        throw new Error("MISSING_TASKS");
      }
      const byId = new Map(rows.map((r) => [r.id, r.lockVersion] as const));
      for (const it of items) {
        if (byId.get(it.taskId) !== it.expectedLockVersion) {
          throw new ConflictError();
        }
      }
      // Re-number positions in dense increments of 10 so subsequent inline
      // inserts have room (10, 20, 30, …) without immediate renumber.
      //
      // The pre-check above is NOT sufficient on its own under READ COMMITTED
      // isolation: a sibling transaction that committed between our SELECT
      // and our UPDATEs could have bumped a row's lockVersion, and our UPDATE
      // (filtered only by id) would overwrite it silently.
      // Each UPDATE therefore re-asserts the expected lockVersion in its
      // WHERE clause and we throw ConflictError if any single update
      // returned zero rows — the surrounding transaction rolls back, so the
      // entire reorder is atomic even when racing with concurrent edits.
      for (let i = 0; i < items.length; i++) {
        const updated = await tx
          .update(schema.tasks)
          .set({
            position: (i + 1) * 10,
            updatedAt: new Date(),
            lockVersion: sql`${schema.tasks.lockVersion} + 1`,
          })
          .where(
            and(
              eq(schema.tasks.id, items[i].taskId),
              eq(schema.tasks.projectId, projectId),
              eq(schema.tasks.lockVersion, items[i].expectedLockVersion),
              isNull(schema.tasks.deletedAt)
            )
          )
          .returning({ id: schema.tasks.id });
        ensureUpdated(updated);
      }
    });
  } catch (e) {
    const conflict = conflictResponse(e);
    if (conflict) return conflict;
    if (e instanceof Error && e.message === "MISSING_TASKS") {
      return NextResponse.json(
        { error: "Some task IDs are not in this project" },
        { status: 400 }
      );
    }
    throw e;
  }

  await recordAudit({
    projectId,
    actorId: user.id,
    action: "task.reorder",
    targetType: "project",
    targetId: projectId,
    after: { count: items.length },
  });
  return NextResponse.json({ ok: true });
}
