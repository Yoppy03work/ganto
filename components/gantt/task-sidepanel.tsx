"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TASK_STATUSES, TASK_TYPES, type GanttTaskDTO } from "@/lib/gantt/types";
import { TaskHistory } from "./task-history";

type Member = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

type Comment = {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
  createdAt: string;
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateToInput(iso: string | null): string {
  if (!iso) return "";
  return isoDay(new Date(iso));
}

export function TaskSidepanel({
  projectId,
  task,
  allTasks,
  deps,
  members,
  currentUserId,
  canEdit,
  onClose,
  onChanged,
  onDeleted,
  onDepsChanged,
}: {
  projectId: string;
  task: GanttTaskDTO;
  allTasks: GanttTaskDTO[];
  deps: { fromTaskId: string; toTaskId: string }[];
  members: Member[];
  currentUserId: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: (patch: Partial<GanttTaskDTO>) => void;
  onDeleted: () => void;
  onDepsChanged: (deps: { fromTaskId: string; toTaskId: string }[]) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState(task.status);
  const [type, setType] = useState<string>(task.type ?? "Feature");
  const [start, setStart] = useState(dateToInput(task.startAt));
  const [end, setEnd] = useState(dateToInput(task.endAt));
  const [progress, setProgress] = useState<string>(
    task.progress != null ? String(Math.round(task.progress * 100)) : ""
  );
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [tab, setTab] = useState<"details" | "history">("details");

  // Note: this component is keyed by task.id at the call site, so switching
  // tasks remounts and re-initializes the form fields from the new task prop.

  // Fetch comments for this task.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/comments`,
        { credentials: "same-origin" }
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { comments: Comment[] };
      setComments(data.comments);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, task.id]);

  async function patch(field: string, body: Record<string, unknown>) {
    setError(null);
    setSavingField(field);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            // Optimistic concurrency token from our last read of this task.
            expectedLockVersion: task.lockVersion,
            ...body,
          }),
        }
      );
      if (res.status === 409) {
        setError("他のユーザーが先に変更しました。サイドパネルを閉じて再度開いてください。");
        setSavingField(null);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setSavingField(null);
        return;
      }
      const data = await res.json().catch(() => ({} as { lockVersion?: number }));
      const update: Partial<GanttTaskDTO> = { ...(body as Partial<GanttTaskDTO>) };
      if (typeof data.lockVersion === "number") update.lockVersion = data.lockVersion;
      onChanged(update);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingField(null);
    }
  }

  async function commitTitle() {
    const v = title.trim();
    if (v && v !== task.title) await patch("title", { title: v });
    else setTitle(task.title);
  }

  async function commitStatus(v: string) {
    setStatus(v);
    await patch("status", { status: v });
  }

  async function commitType(v: string) {
    setType(v);
    await patch("type", { type: v });
  }

  async function commitDates() {
    const s = start ? new Date(start).toISOString() : null;
    const e = end ? new Date(end).toISOString() : null;
    if (s && e && new Date(e) < new Date(s)) {
      setError("End date must be on or after start.");
      return;
    }
    await patch("dates", { startAt: s, endAt: e });
  }

  async function commitProgress() {
    const n = parseInt(progress, 10);
    if (Number.isNaN(n)) {
      await patch("progress", { progress: null });
      return;
    }
    const p = Math.max(0, Math.min(100, n)) / 100;
    await patch("progress", { progress: p });
  }

  async function deleteTask() {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setSavingField("delete");
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setSavingField(null);
        return;
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSavingField(null);
    }
  }

  async function toggleAssignee(userId: string, isCurrentlyAssigned: boolean) {
    setError(null);
    const url = `/api/projects/${projectId}/tasks/${task.id}/assignees/${userId}`;
    try {
      const res = await fetch(url, {
        method: isCurrentlyAssigned ? "DELETE" : "PUT",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        return;
      }
      const m = members.find((mm) => mm.userId === userId);
      if (!m) return;
      const nextAssignees = isCurrentlyAssigned
        ? task.assignees.filter((a) => a.userId !== userId)
        : [...task.assignees, { userId: m.userId, name: m.name, image: m.image }];
      onChanged({ assignees: nextAssignees });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  async function postComment() {
    const v = commentDraft.trim();
    if (!v) return;
    setPostingComment(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ body: v }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        return;
      }
      setCommentDraft("");
      // Re-fetch (small list, simpler than splicing).
      const list = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/comments`,
        { credentials: "same-origin" }
      );
      if (list.ok) {
        const data = (await list.json()) as { comments: Comment[] };
        setComments(data.comments);
      }
    } finally {
      setPostingComment(false);
    }
  }

  async function deleteCommentRow(id: string) {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch(
      `/api/projects/${projectId}/tasks/${task.id}/comments/${id}`,
      { method: "DELETE", credentials: "same-origin" }
    );
    if (res.ok) setComments((arr) => arr.filter((c) => c.id !== id));
  }

  const assignedIds = new Set(task.assignees.map((a) => a.userId));

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 bg-card border-l border-border shadow-modal flex flex-col z-20"
      style={{ width: 420 }}
    >
      <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          {(["details", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded transition-colors " +
                (tab === t
                  ? "text-foreground bg-muted"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t === "details" ? "Task" : "History"}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-sm"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {tab === "history" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <TaskHistory projectId={projectId} taskId={task.id} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="sp-title">Title</Label>
          <Input
            id="sp-title"
            value={title}
            disabled={!canEdit || savingField === "title"}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>

        {/* Status / Type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sp-status">Status</Label>
            <select
              id="sp-status"
              value={status}
              disabled={!canEdit}
              onChange={(e) => commitStatus(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-type">Type</Label>
            <select
              id="sp-type"
              value={type}
              disabled={!canEdit}
              onChange={(e) => commitType(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sp-start">Start</Label>
            <Input
              id="sp-start"
              type="date"
              value={start}
              disabled={!canEdit}
              onChange={(e) => setStart(e.target.value)}
              onBlur={commitDates}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-end">End</Label>
            <Input
              id="sp-end"
              type="date"
              value={end}
              disabled={!canEdit}
              onChange={(e) => setEnd(e.target.value)}
              onBlur={commitDates}
            />
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <Label htmlFor="sp-progress">Progress %</Label>
          <Input
            id="sp-progress"
            type="number"
            min={0}
            max={100}
            value={progress}
            disabled={!canEdit}
            onChange={(e) => setProgress(e.target.value)}
            onBlur={commitProgress}
          />
        </div>

        {/* Assignees */}
        <div className="space-y-2">
          <Label>Assignees</Label>
          <div className="rounded-md border border-border overflow-hidden">
            {members.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground italic">
                No project members.
              </div>
            ) : (
              members.map((m) => {
                const on = assignedIds.has(m.userId);
                return (
                  <label
                    key={m.userId}
                    className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/40 text-[12.5px]"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!canEdit}
                      onChange={() => toggleAssignee(m.userId, on)}
                    />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-[10.5px] text-muted-foreground truncate">{m.email}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Blocked by — incoming dependencies */}
        <DependenciesSection
          projectId={projectId}
          task={task}
          allTasks={allTasks}
          deps={deps}
          canEdit={canEdit}
          onDepsChanged={onDepsChanged}
          onError={setError}
        />

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={deleteTask}
              disabled={savingField === "delete"}
            >
              {savingField === "delete" ? "Deleting..." : "Delete task"}
            </Button>
          </div>
        )}

        {/* Comments */}
        <div className="space-y-2 border-t border-border pt-4">
          <Label>Comments</Label>
          <div className="space-y-3">
            {comments.length === 0 && (
              <div className="text-[12px] text-muted-foreground italic">
                No comments yet.
              </div>
            )}
            {comments.map((c) => {
              const isMine = c.authorId === currentUserId;
              return (
                <div key={c.id} className="text-[13px] space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {c.authorName ?? "(unknown)"}
                    </span>
                    <span>·</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                    {isMine && (
                      <button
                        onClick={() => deleteCommentRow(c.id)}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        aria-label="Delete comment"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-foreground">{c.body}</div>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 pt-2">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Write a comment…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-[13px]"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={postComment}
                disabled={!commentDraft.trim() || postingComment}
              >
                {postingComment ? "Posting..." : "Post"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}
    </aside>
  );
}

function DependenciesSection({
  projectId,
  task,
  allTasks,
  deps,
  canEdit,
  onDepsChanged,
  onError,
}: {
  projectId: string;
  task: GanttTaskDTO;
  allTasks: GanttTaskDTO[];
  deps: { fromTaskId: string; toTaskId: string }[];
  canEdit: boolean;
  onDepsChanged: (deps: { fromTaskId: string; toTaskId: string }[]) => void;
  onError: (msg: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [selectedFrom, setSelectedFrom] = useState("");
  const blockedBy = deps.filter((d) => d.toTaskId === task.id);

  async function add() {
    if (!selectedFrom) return;
    onError(null);
    const res = await fetch(`/api/projects/${projectId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ fromTaskId: selectedFrom, toTaskId: task.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
      return;
    }
    onDepsChanged([...deps, { fromTaskId: selectedFrom, toTaskId: task.id }]);
    setSelectedFrom("");
    setPicking(false);
  }

  async function remove(fromId: string) {
    onError(null);
    const res = await fetch(`/api/projects/${projectId}/dependencies`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ fromTaskId: fromId, toTaskId: task.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
      return;
    }
    onDepsChanged(
      deps.filter((d) => !(d.fromTaskId === fromId && d.toTaskId === task.id))
    );
  }

  const candidateTasks = allTasks.filter(
    (t) =>
      t.id !== task.id && !blockedBy.some((d) => d.fromTaskId === t.id)
  );

  return (
    <div className="space-y-2">
      <Label>Blocked by</Label>
      {blockedBy.length === 0 ? (
        <div className="text-[12px] text-muted-foreground italic">No upstream tasks.</div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          {blockedBy.map((d) => {
            const t = allTasks.find((x) => x.id === d.fromTaskId);
            return (
              <div
                key={d.fromTaskId}
                className="px-3 py-2 flex items-center gap-2 border-b border-border last:border-b-0 text-[12.5px]"
              >
                <span className="flex-1 truncate">{t?.title ?? d.fromTaskId}</span>
                {canEdit && (
                  <button
                    onClick={() => remove(d.fromTaskId)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                    aria-label="Remove dependency"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canEdit && (
        <div>
          {picking ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedFrom}
                onChange={(e) => setSelectedFrom(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
              >
                <option value="">Select a task…</option>
                {candidateTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={add} disabled={!selectedFrom}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPicking(false);
                  setSelectedFrom("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setPicking(true)}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              + Add dependency
            </button>
          )}
        </div>
      )}
    </div>
  );
}

