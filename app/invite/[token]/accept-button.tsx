"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok || typeof data.projectId !== "string") {
        const msg = typeof data.error === "string" ? data.error : `Failed (${res.status})`;
        setError(msg);
        setLoading(false);
        return;
      }
      window.location.assign(`/p/${data.projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={accept} disabled={loading} className="w-full">
        {loading ? "Joining..." : "Accept invitation"}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
