import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "./settings-form";
import { DangerZone } from "./danger-zone";
import { GithubSyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      project: schema.projects,
      role: schema.roles,
    })
    .from(schema.memberships)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.memberships.projectId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.userId, user.id),
        eq(schema.memberships.projectId, projectId)
      )
    )
    .limit(1);
  if (rows.length === 0) notFound();
  const { project, role } = rows[0];

  const isOwner = role.name === "Owner";
  const canEdit = role.name === "Owner" || role.name === "Admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="font-mono text-base font-semibold tracking-tight hover:underline"
          >
            ganto
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/p/${project.id}`} className="text-sm font-medium hover:underline">
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/p/${project.id}`}>
            <Button variant="ghost" size="sm">Back to Gantt</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
          {!canEdit && (
            <p className="text-sm text-muted-foreground mt-1">
              You can view these settings but only Owners and Admins can edit them.
            </p>
          )}
        </div>

        <SettingsForm
          projectId={project.id}
          initial={{
            name: project.name,
            description: project.description,
            storageMode: project.storageMode,
            githubOwner: project.githubOwner,
            githubProjectNumber: project.githubProjectNumber,
            lockVersion: project.lockVersion,
          }}
          canEdit={canEdit}
        />

        {project.storageMode === "github" && canEdit && (
          <section className="rounded-md border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">GitHub sync</h2>
            <p className="text-sm text-muted-foreground">
              Pulls items + Status / Start / End from{" "}
              <code className="font-mono text-foreground">
                {project.githubOwner}/{project.githubProjectNumber}
              </code>{" "}
              into this project. Existing tasks with matching external IDs are
              updated; new ones are inserted.
            </p>
            <GithubSyncButton projectId={project.id} />
          </section>
        )}

        {isOwner && <DangerZone projectId={project.id} projectName={project.name} />}
      </main>
    </div>
  );
}
