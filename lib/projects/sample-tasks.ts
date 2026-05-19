import "server-only";
import { db, schema } from "@/db/client";
import { addDays, startOfDay } from "@/lib/gantt/date";

/**
 * Seed a fresh project with a small set of demo tasks so the Gantt isn't
 * empty on first visit. The dates are computed relative to "today" so they
 * always look reasonable, and a small dependency chain is included so the
 * critical-path + arrow features have something to render.
 *
 * Mirrors the design's TASKS array (subset).
 */
type TaskKey =
  | "infra-setup"
  | "docs-handson"
  | "feat-oauth"
  | "design-badges"
  | "design-grid"
  | "feat-drag"
  | "docs-readme"
  | "feat-empty"
  | "feat-newdialog"
  | "chore-rollout";

const TEMPLATES: Array<{
  key: TaskKey;
  title: string;
  status: "Todo" | "In Progress" | "Done" | "Backlog";
  type: string;
  startOffset: number; // days from today (today = 0)
  endOffset: number;
  progress: number | null;
}> = [
  { key: "infra-setup",    title: "Set up GitHub Projects v2 connector",   status: "Done",        type: "Infra",   startOffset: -3, endOffset: 2,  progress: 1.0 },
  { key: "docs-handson",   title: "ハンズオン資料を書く",                    status: "In Progress", type: "Docs",    startOffset: -2, endOffset: 1,  progress: 0.4 },
  { key: "feat-oauth",     title: "Implement OAuth flow",                  status: "In Progress", type: "Feature", startOffset: 0,  endOffset: 5,  progress: 0.6 },
  { key: "design-badges",  title: "Status バッジのスタイル統一",             status: "Todo",        type: "Design",  startOffset: 0,  endOffset: 2,  progress: 0.5 },
  { key: "design-grid",    title: "Design timeline grid + day scale",      status: "In Progress", type: "Design",  startOffset: 1,  endOffset: 8,  progress: 0.35 },
  { key: "feat-drag",      title: "Drag / resize bar interactions",        status: "Todo",        type: "Feature", startOffset: 7,  endOffset: 12, progress: null },
  { key: "docs-readme",    title: "プロジェクトの README を整える",         status: "Todo",        type: "Docs",    startOffset: 9,  endOffset: 11, progress: null },
  { key: "feat-empty",     title: "Empty + error states",                  status: "Todo",        type: "Feature", startOffset: 11, endOffset: 14, progress: null },
  { key: "feat-newdialog", title: "New task dialog + validation",          status: "Backlog",     type: "Feature", startOffset: 13, endOffset: 17, progress: null },
  { key: "chore-rollout",  title: "Roll out to hackathon team",            status: "Backlog",     type: "Chore",   startOffset: 16, endOffset: 20, progress: null },
];

/**
 * Dependency edges (predecessor → successor) — picks out a clear critical
 * path: infra-setup → feat-oauth → design-grid → feat-drag → feat-empty →
 * feat-newdialog → chore-rollout (~23 days end-to-end).
 */
const DEPENDENCIES: Array<[TaskKey, TaskKey]> = [
  ["infra-setup", "feat-oauth"],
  ["infra-setup", "design-grid"],
  ["design-grid", "feat-drag"],
  ["feat-drag", "feat-empty"],
  ["feat-empty", "feat-newdialog"],
  ["feat-newdialog", "chore-rollout"],
];

export async function seedSampleTasks(opts: {
  projectId: string;
  createdBy: string;
}): Promise<void> {
  const today = startOfDay(new Date());
  const inserted = await db
    .insert(schema.tasks)
    .values(
      TEMPLATES.map((t, i) => ({
        projectId: opts.projectId,
        title: t.title,
        status: t.status,
        type: t.type,
        startAt: addDays(today, t.startOffset),
        endAt: addDays(today, t.endOffset),
        progress: t.progress,
        visibility: "all" as const,
        position: i,
        createdBy: opts.createdBy,
      }))
    )
    .returning({ id: schema.tasks.id });

  // Map TaskKey → newly-inserted UUID for the dependency rows.
  const idByKey: Partial<Record<TaskKey, string>> = {};
  inserted.forEach((row, i) => {
    idByKey[TEMPLATES[i].key] = row.id;
  });

  const depRows = DEPENDENCIES
    .map(([from, to]) => {
      const fromId = idByKey[from];
      const toId = idByKey[to];
      if (!fromId || !toId) return null;
      return { fromTaskId: fromId, toTaskId: toId };
    })
    .filter((r): r is { fromTaskId: string; toTaskId: string } => r !== null);

  if (depRows.length > 0) {
    await db.insert(schema.taskDependencies).values(depRows);
  }
}
