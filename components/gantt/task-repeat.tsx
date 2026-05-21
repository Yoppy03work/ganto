"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Repeat control: clones the task forward N times at a weekly/monthly
 * interval. One-shot generation (no cron).
 */
export function TaskRepeat({
  projectId,
  taskId,
  onRepeated,
}: {
  projectId: string;
  taskId: string;
  onRepeated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [interval, setInterval] = useState<"week" | "month">("week");
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/tasks/${taskId}/repeat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ interval, count }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "失敗しました");
        return;
      }
      toast.success(`${data.created} 件の繰り返しタスクを作成しました`);
      setOpen(false);
      onRepeated();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <Repeat className="size-3.5" /> 繰り返し作成
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={interval}
        onChange={(e) => setInterval(e.target.value as "week" | "month")}
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
      >
        <option value="week">毎週</option>
        <option value="month">毎月</option>
      </select>
      <input
        type="number"
        min={1}
        max={52}
        value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(52, Number(e.target.value))))}
        className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs"
      />
      <span className="text-[11px] text-muted-foreground">回</span>
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? "..." : "作成"}
      </Button>
      <button
        onClick={() => setOpen(false)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        キャンセル
      </button>
    </div>
  );
}
