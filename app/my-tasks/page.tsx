import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/server";
import { listMyTasks } from "@/lib/projects/my-tasks";
import { NotificationBell } from "@/components/notification-bell";
import { MyTasksList } from "./my-tasks-list";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) redirect("/login");

  const tasks = await listMyTasks(user.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-base font-semibold tracking-tight hover:underline">
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">My tasks</span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            あなたが担当している全プロジェクトのタスク（{tasks.length} 件）
          </p>
        </div>
        <MyTasksList
          tasks={tasks.map((t) => ({
            id: t.id,
            projectId: t.projectId,
            projectName: t.projectName,
            title: t.title,
            status: t.status,
            startAt: t.startAt ? t.startAt.toISOString() : null,
            endAt: t.endAt ? t.endAt.toISOString() : null,
          }))}
        />
      </main>
    </div>
  );
}
