"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/**
 * Export the Gantt timeline as PNG or PDF. Captures the
 * #gantt-timeline-export node (full-width timeline incl. date header + bars)
 * with html-to-image, then for PDF wraps the PNG in a single-page jsPDF.
 *
 * Libraries are imported lazily so they're only pulled into the bundle when
 * the user actually exports.
 */
export function ExportMenu({ projectName }: { projectName: string }) {
  const [busy, setBusy] = useState(false);

  function getNode(): HTMLElement | null {
    return document.getElementById("gantt-timeline-export");
  }

  async function exportPng() {
    const node = getNode();
    if (!node) {
      toast.error("ガント領域が見つかりません");
      return;
    }
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#fff",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slug(projectName)}-gantt.png`;
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PNG エクスポート失敗");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    const node = getNode();
    if (!node) {
      toast.error("ガント領域が見つかりません");
      return;
    }
    setBusy(true);
    try {
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const w = node.scrollWidth;
      const h = node.scrollHeight;
      const orientation = w >= h ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "px", format: [w, h] });
      pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
      pdf.save(`${slug(projectName)}-gantt.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF エクスポート失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input text-xs font-medium text-muted-foreground hover:text-foreground"
          title="エクスポート"
          disabled={busy}
        >
          <Download className="size-3.5" />
          {busy ? "..." : "Export"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1">
        <button
          onClick={exportPng}
          disabled={busy}
          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/50"
        >
          PNG 画像
        </button>
        <button
          onClick={exportPdf}
          disabled={busy}
          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted/50"
        >
          PDF
        </button>
      </PopoverContent>
    </Popover>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}
