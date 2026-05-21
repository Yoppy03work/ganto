import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { listProjectsForUser } from "@/lib/projects/create";
import { Button } from "@/components/ui/button";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { NotificationBell } from "@/components/notification-bell";

// Server Components that read the Neon Auth session must be dynamic.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    // proxy.ts should already have redirected, but this is a safety net.
    redirect("/login");
  }
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 h-12 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold tracking-tight">ganto</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <NotificationBell />
          <Link
            href="/account"
            className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
            title="Account settings"
          >
            {user.email ?? user.name ?? user.id}
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {projects.length === 0
                ? "You don't have any projects yet."
                : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <NewProjectDialog
            trigger={<Button>+ New project</Button>}
          />
        </div>

        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                className="rounded-md border border-border bg-card p-4 hover:bg-muted/40 transition-colors block"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="font-semibold text-sm truncate flex-1">{p.name}</h2>
                  <RoleBadge role={p.roleName} />
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {p.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10.5px] font-mono text-muted-foreground">
                  <span>{p.storageMode}</span>
                  <span>{formatDate(p.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-md py-16 px-6 flex flex-col items-center text-center gap-3">
      <h2 className="text-lg font-semibold">Create your first project</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        A project holds tasks, members, and roles. You can connect it to GitHub
        Projects v2 later, or keep it local.
      </p>
      <NewProjectDialog
        trigger={<Button className="mt-2">+ New project</Button>}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
      {role}
    </span>
  );
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
