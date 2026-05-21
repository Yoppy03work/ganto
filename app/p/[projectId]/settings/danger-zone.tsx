"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Danger zone for project settings.
 *
 * Project deletion is now a SOFT delete: the project moves to Trash and can be
 * restored from the home page's "Deleted projects" section. (Replaces the old
 * ALLOW_PROJECT_DELETE hard-delete gate — soft delete is safe by default.)
 */
export function DangerZone({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirm.trim() === projectName;

  async function destroy() {
    if (!ready) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setDeleting(false);
        return;
      }
      // Soft-deleted → it disappears from the project list; go home.
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-md border border-destructive/30 bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        プロジェクトを削除すると Trash に移動します。ホーム画面の「Deleted
        projects」からいつでも復元できます（誤削除しても安全）。
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-name">
          確認のため <span className="font-mono text-foreground">{projectName}</span> と入力
        </Label>
        <Input
          id="confirm-name"
          value={confirm}
          autoComplete="off"
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button variant="destructive" disabled={!ready || deleting} onClick={destroy}>
        {deleting ? "削除中..." : "プロジェクトを削除"}
      </Button>
    </section>
  );
}
