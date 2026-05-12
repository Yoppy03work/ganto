/**
 * One-off helper: add a critical-path-friendly dependency chain to an
 * existing project's tasks. Used to demo Critical Path on a project that
 * was seeded before dependencies were part of seedSampleTasks().
 *
 *   pnpm tsx --env-file=.env.local scripts/add-deps-to-existing-project.ts <projectId>
 */
import { neon } from "@neondatabase/serverless";

const PROJECT_ID = process.argv[2];
if (!PROJECT_ID) {
  console.error("Usage: tsx scripts/add-deps-to-existing-project.ts <projectId>");
  process.exit(1);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  const tasks = (await sql`
    SELECT id, title FROM tasks
    WHERE project_id = ${PROJECT_ID}
    ORDER BY position
  `) as Array<{ id: string; title: string }>;

  if (tasks.length === 0) {
    console.error(`No tasks in project ${PROJECT_ID}`);
    process.exit(1);
  }

  const find = (needle: string) =>
    tasks.find((t) => t.title.toLowerCase().includes(needle.toLowerCase()));

  const pairs: Array<[string, string]> = [];
  const e = (a: string, b: string) => {
    const ta = find(a);
    const tb = find(b);
    if (ta && tb) pairs.push([ta.id, tb.id]);
  };
  e("github projects v2 connector", "implement oauth flow");
  e("github projects v2 connector", "design timeline grid");
  e("design timeline grid", "drag / resize bar");
  e("drag / resize bar", "empty + error states");
  e("empty + error states", "new task dialog");
  e("new task dialog", "roll out to hackathon team");

  if (pairs.length === 0) {
    console.error("Could not match any task titles");
    process.exit(1);
  }

  // Clear existing deps in this project's task set, then insert.
  const taskIds = tasks.map((t) => t.id);
  await sql`DELETE FROM task_dependencies WHERE from_task_id = ANY(${taskIds})`;
  for (const [from, to] of pairs) {
    await sql`INSERT INTO task_dependencies (from_task_id, to_task_id) VALUES (${from}, ${to}) ON CONFLICT DO NOTHING`;
  }

  console.log(`Inserted ${pairs.length} dependencies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
