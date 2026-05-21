import "server-only";
import { and, eq, isNull, desc, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type NotificationRow = {
  id: string;
  projectId: string;
  taskId: string | null;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
  actorName: string | null;
};

/** Recent notifications for a user across all their projects. */
export async function listNotifications(
  userId: string,
  limit = 30
): Promise<NotificationRow[]> {
  const rows = await db
    .select({
      id: schema.notifications.id,
      projectId: schema.notifications.projectId,
      taskId: schema.notifications.taskId,
      type: schema.notifications.type,
      title: schema.notifications.title,
      body: schema.notifications.body,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
      actorName: schema.neonUsers.name,
    })
    .from(schema.notifications)
    .leftJoin(
      schema.neonUsers,
      sql`${schema.notifications.actorId}::uuid = ${schema.neonUsers.id}`
    )
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows;
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt)
      )
    );
  return Number(row?.n ?? 0);
}

/** Mark specific notifications (or all) read for a user. */
export async function markRead(
  userId: string,
  ids: string[] | "all"
): Promise<void> {
  const base = and(
    eq(schema.notifications.userId, userId),
    isNull(schema.notifications.readAt)
  );
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      ids === "all"
        ? base
        : and(base, inArray(schema.notifications.id, ids))
    );
}

/**
 * Insert notification rows (skips self-notifications). Best-effort: callers
 * should not let a notification failure break the primary mutation.
 */
export async function createNotifications(
  rows: {
    userId: string;
    projectId: string;
    taskId?: string | null;
    type: string;
    actorId?: string | null;
    title: string;
    body?: string | null;
  }[]
): Promise<void> {
  const toInsert = rows.filter((r) => r.userId !== r.actorId);
  if (toInsert.length === 0) return;
  await db.insert(schema.notifications).values(
    toInsert.map((r) => ({
      userId: r.userId,
      projectId: r.projectId,
      taskId: r.taskId ?? null,
      type: r.type,
      actorId: r.actorId ?? null,
      title: r.title,
      body: r.body ?? null,
    }))
  );
}
