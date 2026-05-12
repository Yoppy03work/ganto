"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = {
  id: string;
  name: string;
};

export function InvitePanel({
  projectId,
  roles,
}: {
  projectId: string;
  roles: Role[];
}) {
  // Default role: prefer "Member" if present, otherwise the first non-Owner role.
  const defaultRoleId =
    roles.find((r) => r.name === "Member")?.id ??
    roles.find((r) => r.name !== "Owner")?.id ??
    roles[0]?.id ??
    "";

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createInvite(opts: { withEmail: boolean }) {
    setError(null);
    setCreatedUrl(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          roleId,
          email: opts.withEmail ? email.trim() || null : null,
        }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok || typeof data.url !== "string") {
        const msg = typeof data.error === "string" ? data.error : `Failed (${res.status})`;
        setError(msg);
        setLoading(false);
        return;
      }
      setCreatedUrl(data.url);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  async function copy() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="default">
        Invite member
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 w-full sm:w-[420px] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Invite a member</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCreatedUrl(null);
            setError(null);
            setEmail("");
          }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          Close
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
        >
          {roles
            .filter((r) => r.name !== "Owner")
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email (optional)</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
        <p className="text-[10.5px] text-muted-foreground">
          Leave blank for a reusable link any member can join with.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!createdUrl ? (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            disabled={loading || !roleId}
            onClick={() => createInvite({ withEmail: false })}
          >
            Create link
          </Button>
          <Button
            variant="default"
            disabled={loading || !roleId || !email.trim()}
            onClick={() => createInvite({ withEmail: true })}
          >
            {loading ? "Creating..." : "Create email invite"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Invite link</Label>
          <div className="flex items-center gap-2">
            <Input readOnly value={createdUrl} className="font-mono text-[11.5px]" />
            <Button onClick={copy} variant="outline">
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
