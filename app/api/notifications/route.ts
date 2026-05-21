import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { listNotifications, unreadCount } from "@/lib/projects/notifications";

export const runtime = "nodejs";

/** Current user's notifications across all projects + unread count. */
export async function GET() {
  const user = await requireCurrentUser();
  const [items, unread] = await Promise.all([
    listNotifications(user.id),
    unreadCount(user.id),
  ]);
  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      projectId: n.projectId,
      taskId: n.taskId,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      actorName: n.actorName,
    })),
    unread,
  });
}
