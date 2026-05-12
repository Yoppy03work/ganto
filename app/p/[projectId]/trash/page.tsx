import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireCurrentUser } from "@/lib/auth/server";
import { getMembership } from "@/lib/projects/members";
import { hasCapability, hasCapabilityFor } from "@/lib/auth/permission";
import { listTrash } from "@/lib/projects/tasks";
import { TrashList } from "./trash-list";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireCurrentUser();
  const membership = await getMembership(user.id, projectId);
  if (!membership) redirect("/");

  // Block Viewers — they can't restore anything, so the page is just noise.
  const canDeleteAny = await hasCapability(user.id, projectId, "task.delete");
  const canDeleteOwn = await hasCapabilityFor(
    user.id,
    projectId,
    "task.delete",
    true
  );
  if (!canDeleteAny && !canDeleteOwn) redirect(`/p/${projectId}`);

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) redirect("/");

  // Mirror the API: full-scope users see every deletion; own-scope only see
  // their own. The TrashList client component also hides the Restore button
  // for rows the caller can't restore, but defense-in-depth at the source
  // matters more for confidentiality.
  const trash = await listTrash(projectId, canDeleteAny ? undefined : user.id);

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
          <span className="text-sm">Trash</span>
        </div>
        <Link
          href={`/p/${project.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to Gantt
        </Link>
      </header>

      <main className="max-w-3xl mx-auto w-full px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
          <p className="text-sm text-muted-foreground mt-1">
            削除されたタスクの一覧です。Restore すると末尾の位置に戻ります。
            {!canDeleteAny &&
              " 自分が削除したタスクのみ復元できます。"}
          </p>
        </div>

        <TrashList
          projectId={project.id}
          initial={trash.map((t) => ({
            id: t.id,
            title: t.title,
            deletedAt: t.deletedAt.toISOString(),
            deletedBy: t.deletedBy,
          }))}
          canDeleteAny={canDeleteAny}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
