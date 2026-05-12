"use client";

/**
 * Danger zone for project settings.
 *
 * Project hard-delete is **disabled by default** in production. The API gates
 * itself on the `ALLOW_PROJECT_DELETE` env var (returns 503 if missing), so
 * even if a UI bug exposed the button, the request would be rejected.
 *
 * We still render an explainer block here so Owners know the option exists
 * but is intentionally locked. To actually delete a project, see
 * docs/OPS-CHECKLIST.md → "Emergency response" section.
 */
export function DangerZone({
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <section className="rounded-md border border-destructive/30 bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        Hard-deleting <span className="font-mono text-foreground">{projectName}</span>{" "}
        is intentionally disabled to prevent accidental data loss. Tasks can be
        soft-deleted and recovered from the project&apos;s Trash; permanent
        project deletion is an operator-only action.
      </p>
      <p className="text-xs text-muted-foreground">
        必要な場合は管理者に連絡してください
        (<code className="font-mono">ALLOW_PROJECT_DELETE</code> フラグの一時的な
        オン → DELETE → オフ で対応)。手順は <code className="font-mono">
        docs/OPS-CHECKLIST.md
        </code> 参照。
      </p>
    </section>
  );
}
