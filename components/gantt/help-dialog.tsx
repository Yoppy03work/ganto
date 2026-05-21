"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "N", label: "新しいタスクを作成" },
  { keys: "/", label: "検索にフォーカス" },
  { keys: "?", label: "このヘルプを表示" },
  { keys: "Esc", label: "検索クリア / パネルを閉じる" },
];

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>キーボードショートカット</DialogTitle>
          <DialogDescription>
            入力欄にフォーカスしていないときに使えます。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between text-sm py-1"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-input bg-muted">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
