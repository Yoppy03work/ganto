"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CapabilityCatalogEntry = {
  capability: string;
  label: string;
  ownScopeAllowed: boolean;
};

type Capability = { capability: string; scope: "all" | "own" };

type Role = {
  id: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  position: number;
  capabilities: Capability[];
  /** Optimistic concurrency token for the role row. */
  lockVersion: number;
};

export function RoleEditor({
  projectId,
  initialRoles,
  catalog,
  canManage,
}: {
  projectId: string;
  initialRoles: Role[];
  catalog: ReadonlyArray<CapabilityCatalogEntry>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setError(null);
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(roleId: string) {
    setError(null);
    setEditingId(roleId);
    setCreating(false);
  }

  function cancel() {
    setCreating(false);
    setEditingId(null);
    setError(null);
  }

  async function refresh() {
    const res = await fetch(`/api/projects/${projectId}/roles`, {
      credentials: "same-origin",
    });
    if (res.ok) {
      const data = (await res.json()) as { roles: Role[] };
      setRoles(data.roles);
    }
    router.refresh();
  }

  async function deleteRole(roleId: string) {
    if (!confirm("Delete this role? Members on it must be reassigned first.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/roles/${roleId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {roles.map((r) => (
          <div
            key={r.id}
            className="rounded-md border border-border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-semibold text-sm">{r.name}</span>
                {r.isBuiltin && (
                  <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
                    built-in
                  </span>
                )}
                <span className="text-[10.5px] text-muted-foreground font-mono">
                  {r.capabilities.length} permission{r.capabilities.length === 1 ? "" : "s"}
                </span>
              </div>
              {canManage && r.name !== "Owner" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      editingId === r.id ? cancel() : startEdit(r.id)
                    }
                  >
                    {editingId === r.id ? "Close" : "Edit"}
                  </Button>
                  {!r.isBuiltin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRole(r.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </div>
            {editingId === r.id ? (
              <RoleForm
                key={r.id}
                projectId={projectId}
                catalog={catalog}
                initial={r}
                onSaved={async () => {
                  await refresh();
                  cancel();
                }}
                onCancel={cancel}
              />
            ) : (
              <CapabilityChipList capabilities={r.capabilities} catalog={catalog} />
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div>
          {creating ? (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold">
                New role
              </div>
              <RoleForm
                projectId={projectId}
                catalog={catalog}
                initial={null}
                onSaved={async () => {
                  await refresh();
                  cancel();
                }}
                onCancel={cancel}
              />
            </div>
          ) : (
            <Button variant="outline" onClick={startCreate}>
              + New role
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityChipList({
  capabilities,
  catalog,
}: {
  capabilities: Capability[];
  catalog: ReadonlyArray<CapabilityCatalogEntry>;
}) {
  if (capabilities.length === 0) {
    return (
      <div className="px-4 py-3 text-[12px] text-muted-foreground italic">
        No permissions.
      </div>
    );
  }
  const labelOf = (cap: string) =>
    catalog.find((c) => c.capability === cap)?.label ?? cap;
  return (
    <div className="px-4 py-3 flex flex-wrap gap-1.5">
      {capabilities.map((c) => (
        <span
          key={`${c.capability}:${c.scope}`}
          className="inline-flex items-center gap-1 rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[11px]"
        >
          {labelOf(c.capability)}
          {c.scope === "own" && (
            <span className="font-mono text-[9px] text-muted-foreground/70">own</span>
          )}
        </span>
      ))}
    </div>
  );
}

function RoleForm({
  projectId,
  catalog,
  initial,
  onSaved,
  onCancel,
}: {
  projectId: string;
  catalog: ReadonlyArray<CapabilityCatalogEntry>;
  initial: Role | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [caps, setCaps] = useState<Map<string, "all" | "own" | null>>(() => {
    const map = new Map<string, "all" | "own" | null>();
    for (const entry of catalog) map.set(entry.capability, null);
    if (initial) {
      for (const c of initial.capabilities) map.set(c.capability, c.scope);
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setScope(cap: string, scope: "all" | "own" | null) {
    setCaps((prev) => {
      const next = new Map(prev);
      next.set(cap, scope);
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const capabilities: Capability[] = [];
      for (const [cap, scope] of caps) {
        if (scope) capabilities.push({ capability: cap, scope });
      }
      const url = initial
        ? `/api/projects/${projectId}/roles/${initial.id}`
        : `/api/projects/${projectId}/roles`;
      const method = initial ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        capabilities,
      };
      if (initial) body.expectedLockVersion = initial.lockVersion;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        toast.warning("他のユーザーが先にこのロールを編集しました。ページを再読み込みします。");
        setSaving(false);
        onSaved();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={initial?.isBuiltin}
            placeholder="Reviewer"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Input
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this role can do"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Permissions</Label>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="grid bg-muted/40 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
               style={{ gridTemplateColumns: "1fr 60px 60px 60px" }}>
            <div>Capability</div>
            <div className="text-center">None</div>
            <div className="text-center">All</div>
            <div className="text-center">Own only</div>
          </div>
          {catalog.map((entry) => {
            const scope = caps.get(entry.capability) ?? null;
            return (
              <label
                key={entry.capability}
                className="grid items-center px-3 py-1.5 border-t border-border text-[12px]"
                style={{ gridTemplateColumns: "1fr 60px 60px 60px" }}
              >
                <span className="text-foreground">{entry.label}</span>
                <span className="text-center">
                  <input
                    type="radio"
                    name={`cap-${entry.capability}`}
                    checked={scope === null}
                    onChange={() => setScope(entry.capability, null)}
                  />
                </span>
                <span className="text-center">
                  <input
                    type="radio"
                    name={`cap-${entry.capability}`}
                    checked={scope === "all"}
                    onChange={() => setScope(entry.capability, "all")}
                  />
                </span>
                <span className="text-center">
                  {entry.ownScopeAllowed ? (
                    <input
                      type="radio"
                      name={`cap-${entry.capability}`}
                      checked={scope === "own"}
                      onChange={() => setScope(entry.capability, "own")}
                    />
                  ) : (
                    <span className="text-muted-foreground/40">·</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={saving || (!initial?.isBuiltin && !name.trim())}
        >
          {saving ? "Saving..." : initial ? "Save changes" : "Create role"}
        </Button>
      </div>
    </div>
  );
}
