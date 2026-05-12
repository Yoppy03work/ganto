"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Role = {
  id: string;
  name: string;
  isBuiltin: boolean;
};

type Member = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  status: "active" | "suspended";
  joinedAt: string;
  roleId: string;
  roleName: string;
  taskCount: number;
  /** Optimistic concurrency token from the membership row. */
  lockVersion: number;
};

export function MembersTable({
  projectId,
  initialMembers,
  roles,
  currentUserId,
  canManage,
}: {
  projectId: string;
  initialMembers: Member[];
  roles: Role[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignableRoles = roles.filter((r) => r.name !== "Owner");

  async function changeRole(userId: string, newRoleId: string) {
    setError(null);
    setBusyId(userId);
    const previous = members;
    const target = members.find((m) => m.userId === userId);
    if (!target) {
      setBusyId(null);
      return;
    }
    setMembers((arr) =>
      arr.map((m) =>
        m.userId === userId
          ? { ...m, roleId: newRoleId, roleName: roles.find((r) => r.id === newRoleId)?.name ?? m.roleName }
          : m
      )
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          expectedLockVersion: target.lockVersion,
          roleId: newRoleId,
        }),
      });
      if (res.status === 409) {
        toast.warning("他のユーザーが先に変更しました。最新情報に更新します。");
        setMembers(previous);
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setMembers(previous);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { lockVersion?: number };
      if (typeof data.lockVersion === "number") {
        const newVer = data.lockVersion;
        setMembers((arr) =>
          arr.map((m) => (m.userId === userId ? { ...m, lockVersion: newVer } : m))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setMembers(previous);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(userId: string) {
    if (!confirm("Remove this member from the project?")) return;
    setError(null);
    setBusyId(userId);
    const previous = members;
    setMembers((arr) => arr.filter((m) => m.userId !== userId));
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setMembers(previous);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setMembers(previous);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="rounded-md border border-border overflow-hidden">
        <div
          className="grid text-[10.5px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-3 py-2"
          style={{ gridTemplateColumns: "minmax(220px, 1.5fr) 140px 60px 1fr 80px" }}
        >
          <div>Name</div>
          <div>Role</div>
          <div className="text-right pr-2">Tasks</div>
          <div className="text-right">Joined</div>
          <div></div>
        </div>
        {members.map((m) => {
          const isOwner = m.roleName === "Owner";
          const isSelf = m.userId === currentUserId;
          const editable = canManage && !isOwner;
          return (
            <div
              key={m.userId}
              className="grid items-center text-[12.5px] px-3 py-2.5 border-t border-border"
              style={{ gridTemplateColumns: "minmax(220px, 1.5fr) 140px 60px 1fr 80px" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={m.name} image={m.image} />
                <div className="min-w-0">
                  <div className="text-foreground font-medium truncate flex items-center gap-1.5">
                    {m.name}
                    {isSelf && (
                      <span className="text-[10px] text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                </div>
              </div>
              <div>
                {editable ? (
                  <select
                    value={m.roleId}
                    disabled={busyId === m.userId}
                    onChange={(e) => changeRole(m.userId, e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-[11.5px] disabled:opacity-50"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <RoleChip role={m.roleName} />
                )}
              </div>
              <div className="text-right pr-2 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                {m.taskCount > 0 ? m.taskCount : "—"}
              </div>
              <div className="text-right text-[11px] text-muted-foreground font-mono">
                {m.joinedAt.slice(0, 10)}
              </div>
              <div className="flex justify-end">
                {!isOwner && (canManage || isSelf) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === m.userId}
                    onClick={() => remove(m.userId)}
                  >
                    {isSelf ? "Leave" : "Remove"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoleChip({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
      {role}
    </span>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars from arbitrary OAuth providers
      <img
        src={image}
        alt={name}
        width={26}
        height={26}
        className="rounded-full bg-muted"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return (
    <div className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-mono w-[26px] h-[26px] text-[11px]">
      {initials}
    </div>
  );
}
