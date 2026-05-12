"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Initial = {
  name: string;
  description: string | null;
  storageMode: "local" | "github";
  githubOwner: string | null;
  githubProjectNumber: number | null;
  lockVersion: number;
};

export function SettingsForm({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: Initial;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [storageMode, setStorageMode] = useState<"local" | "github">(initial.storageMode);
  const [githubOwner, setGithubOwner] = useState(initial.githubOwner ?? "");
  const [githubProjectNumber, setGithubProjectNumber] = useState(
    initial.githubProjectNumber != null ? String(initial.githubProjectNumber) : ""
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hold the lockVersion locally so multiple saves in the same session
  // chain correctly without forcing a full page refresh between each.
  const [lockVersion, setLockVersion] = useState(initial.lockVersion);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        expectedLockVersion: lockVersion,
        name: name.trim(),
        description: description.trim() || null,
        storageMode,
      };
      if (storageMode === "github") {
        body.githubOwner = githubOwner.trim() || null;
        const n = parseInt(githubProjectNumber.trim(), 10);
        body.githubProjectNumber = Number.isFinite(n) ? n : null;
      } else {
        body.githubOwner = null;
        body.githubProjectNumber = null;
      }
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        toast.warning(
          "他のユーザーが先に設定を変更しました。ページを再読み込みします。"
        );
        setSaving(false);
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { lockVersion?: number };
      if (typeof data.lockVersion === "number") setLockVersion(data.lockVersion);
      setSavedAt(Date.now());
      setSaving(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          value={name}
          autoComplete="off"
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-description">Description</Label>
        <Input
          id="project-description"
          value={description}
          autoComplete="off"
          disabled={!canEdit}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      <fieldset className="space-y-2 border-t border-border pt-6">
        <legend className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium pb-2">
          Storage
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`rounded-md border p-3 cursor-pointer text-sm ${
              storageMode === "local" ? "border-foreground bg-muted/30" : "border-border"
            } ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input
              type="radio"
              name="storage"
              value="local"
              checked={storageMode === "local"}
              disabled={!canEdit}
              onChange={() => setStorageMode("local")}
              className="mr-2"
            />
            <span className="font-medium">Local</span>
            <p className="text-[11px] text-muted-foreground mt-1">
              Tasks live in this app&apos;s database. Most flexible.
            </p>
          </label>
          <label
            className={`rounded-md border p-3 cursor-pointer text-sm ${
              storageMode === "github" ? "border-foreground bg-muted/30" : "border-border"
            } ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input
              type="radio"
              name="storage"
              value="github"
              checked={storageMode === "github"}
              disabled={!canEdit}
              onChange={() => setStorageMode("github")}
              className="mr-2"
            />
            <span className="font-medium">GitHub Projects v2</span>
            <p className="text-[11px] text-muted-foreground mt-1">
              Tasks read from / write to a GitHub Project. Coming in a later phase.
            </p>
          </label>
        </div>

        {storageMode === "github" && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="gh-owner">Owner (user or org)</Label>
              <Input
                id="gh-owner"
                value={githubOwner}
                autoComplete="off"
                disabled={!canEdit}
                onChange={(e) => setGithubOwner(e.target.value)}
                placeholder="Yoppy03work"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gh-num">Project number</Label>
              <Input
                id="gh-num"
                value={githubProjectNumber}
                autoComplete="off"
                inputMode="numeric"
                disabled={!canEdit}
                onChange={(e) => setGithubProjectNumber(e.target.value)}
                placeholder="4"
              />
            </div>
          </div>
        )}
      </fieldset>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canEdit || saving || !name.trim()}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        {savedAt && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
      </div>
    </form>
  );
}
