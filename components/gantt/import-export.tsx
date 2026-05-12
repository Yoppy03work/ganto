"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ImportExportMenu({
  projectId,
  canImport,
  onImported,
}: {
  projectId: string;
  canImport: boolean;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function exportCsv() {
    setOpen(false);
    window.location.href = `/api/projects/${projectId}/tasks/export`;
  }

  function pickFile(mode: "merge" | "replace") {
    setStatus(null);
    if (mode === "replace" && !confirm("Replace ALL existing tasks with the CSV? This cannot be undone.")) {
      return;
    }
    fileRef.current?.setAttribute("data-mode", mode);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const mode = (fileRef.current?.getAttribute("data-mode") ?? "merge") as
      | "merge"
      | "replace";
    setBusy(true);
    setStatus("Importing…");
    try {
      const csv = await file.text();
      const res = await fetch(`/api/projects/${projectId}/tasks/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ csv, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      const summary = `Imported. created: ${data.created}, updated: ${data.updated}, skipped: ${data.skipped}`;
      setStatus(summary);
      setBusy(false);
      setOpen(false);
      onImported();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        Import / Export ▾
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-card shadow-modal z-30 py-1"
        >
          <button
            onClick={exportCsv}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
          >
            Download CSV
          </button>
          {canImport && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => pickFile("merge")}
                disabled={busy}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                Import CSV (merge)
              </button>
              <button
                onClick={() => pickFile("replace")}
                disabled={busy}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted text-destructive disabled:opacity-50"
              >
                Import CSV (replace all)
              </button>
            </>
          )}
          {status && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
              {status}
            </div>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="hidden"
      />
    </div>
  );
}
