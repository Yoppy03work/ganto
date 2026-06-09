"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Download, X } from "lucide-react";
import { toast } from "sonner";

type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  uploaderName: string | null;
  createdAt: string;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachments({
  projectId,
  taskId,
  canEdit,
}: {
  projectId: string;
  taskId: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${taskId}/attachments`,
        { credentials: "same-origin" }
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { attachments: Attachment[] };
      if (!cancelled) setItems(data.attachments);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${taskId}/attachments`,
        { method: "POST", credentials: "same-origin", body: fd }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : `アップロード失敗 (${res.status})`
        );
        return;
      }
      setItems((arr) => [
        {
          id: data.id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          url: data.url,
          uploaderName: null,
          createdAt: new Date().toISOString(),
        },
        ...(arr ?? []),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("この添付ファイルを削除しますか？")) return;
    const prev = items;
    setItems((arr) => (arr ?? []).filter((a) => a.id !== id));
    const res = await fetch(
      `/api/projects/${projectId}/tasks/${taskId}/attachments/${id}`,
      { method: "DELETE", credentials: "same-origin" }
    );
    if (!res.ok) {
      toast.error("削除に失敗しました");
      setItems(prev);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Paperclip className="size-3" /> Attachments
        </div>
        {canEdit && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={onPick}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {uploading ? "アップロード中…" : "+ 追加"}
            </button>
          </>
        )}
      </div>

      {items === null ? (
        <p className="text-[12px] text-muted-foreground">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">添付ファイルはありません。</p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-[13px] rounded-md border border-border px-2 py-1.5"
            >
              <span className="truncate flex-1 min-w-0">{a.filename}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {fmtSize(a.size)}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                download={a.filename}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title="ダウンロード"
              >
                <Download className="size-3.5" />
              </a>
              {canEdit && (
                <button
                  onClick={() => remove(a.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="削除"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
