import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { listProjectTasks } from "@/lib/projects/tasks";
import { reportSummary, burndown, type ReportTask } from "@/lib/gantt/report";
import { BurndownChart } from "./burndown-chart";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) redirect("/");

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) redirect("/");

  const tasksRaw = await listProjectTasks(projectId);
  const tasks: ReportTask[] = tasksRaw.map((t) => ({
    status: t.status,
    startAt: t.startAt ? t.startAt.toISOString() : null,
    endAt: t.endAt ? t.endAt.toISOString() : null,
  }));
  const summary = reportSummary(tasks);
  const points = burndown(tasks);

  const cards: { label: string; value: number; accent?: string }[] = [
    { label: "全タスク", value: summary.total },
    { label: "完了", value: summary.done, accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "進行中", value: summary.inProgress },
    { label: "未着手", value: summary.todo },
    { label: "Backlog", value: summary.backlog },
    { label: "期限超過", value: summary.overdue, accent: "text-destructive" },
  ];

  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="font-mono text-base font-semibold tracking-tight hover:underline">
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/p/${project.id}`} className="text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm">Report</span>
        </div>
        <Link href={`/p/${project.id}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← Back to Gantt
        </Link>
      </header>

      <main className="flex-1 overflow-auto px-6 py-6 max-w-4xl w-full mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">進捗レポート</h1>
          <p className="text-sm text-muted-foreground mt-1">
            完了率 <span className="font-medium text-foreground">{pct}%</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-card p-3">
              <div className={"text-2xl font-semibold tabular-nums " + (c.accent ?? "")}>
                {c.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">バーンダウン</h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <BurndownChart points={points} />
          </div>
        </section>
      </main>
    </div>
  );
}
