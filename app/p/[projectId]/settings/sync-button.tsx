"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GithubSyncButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState<"pull" | "push" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(direction: "pull" | "push") {
    setError(null);
    setResult(null);
    setLoading(direction);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/github/${direction}`,
        { method: "POST", credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
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
      </p>
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
