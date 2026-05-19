"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function GithubSyncButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState<"pull" | "push" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the API returns 412 GITHUB_NOT_CONNECTED. Triggers a dedicated
   * UI block prompting the user to link their GitHub account first, instead
   * of just dumping a generic error.
   */
  const [needsConnect, setNeedsConnect] = useState(false);

  async function run(direction: "pull" | "push") {
    setError(null);
    setResult(null);
    setNeedsConnect(false);
    setLoading(direction);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/github/${direction}`,
        { method: "POST", credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 412 && data?.code === "GITHUB_NOT_CONNECTED") {
        setNeedsConnect(true);
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Failed (${res.status})`);
        return;
      }
      const warn = Array.isArray(data.warnings) && data.warnings.length
        ? ` · warnings: ${data.warnings.join(", ")}`
        : "";
      if (direction === "pull") {
        setResult(`Pulled ${data.upserted} task(s) from GitHub${warn}.`);
      } else {
        setResult(
          `Pushed ${data.pushed} task(s)` +
            (data.created ? ` (${data.created} new draft issue${data.created === 1 ? "" : "s"})` : "") +
            warn +
            "."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => run("pull")}
          disabled={loading !== null}
        >
          {loading === "pull" ? "Pulling..." : "Pull from GitHub"}
        </Button>
        <Button
          variant="outline"
          onClick={() => run("push")}
          disabled={loading !== null}
        >
          {loading === "push" ? "Pushing..." : "Push to GitHub"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pull replaces local Status / Start / End from GitHub. Push writes them
        back; tasks without a GitHub item ID are created as Draft Issues.
        各ユーザーは自分の GitHub アカウントに紐付いた Project だけを同期できます。
      </p>
      {needsConnect && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
          <p>
            GitHub アカウントが未接続です。先に Account 画面から接続してください。
          </p>
          <Link
            href="/account"
            className="inline-flex items-center text-sm font-medium underline underline-offset-2"
          >
            Connect GitHub →
          </Link>
        </div>
      )}
      {result && (
        <p className="text-sm text-muted-foreground">{result}</p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
