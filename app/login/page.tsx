"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.signIn.email({ email, password });
      // Better Auth's response: { data, error } — error is set on failure.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errObj = (res as any)?.error;
      if (errObj) {
        setError(errObj.message ?? `Sign in failed (${errObj.status ?? "?"})`);
        setLoading(false);
        return;
      }
      // Hard navigation: ensures the new session cookie is picked up by proxy.ts
      // on the very next request. router.push() can leave the SSR side stale.
      window.location.assign(from);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      setLoading(false);
    }
  }

  async function onGoogle() {
    setError(null);
    try {
      await authClient.signIn.social({ provider: "google", callbackURL: from });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign in failed";
      setError(msg);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">ganto</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full"
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-right text-xs">
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        </form>

        <div className="relative my-2 text-center text-xs text-muted-foreground">
          <span className="bg-background px-2 relative z-10">or</span>
          <div
            className="absolute left-0 right-0 top-1/2 h-px bg-border"
            aria-hidden
          />
        </div>

        <Button variant="outline" onClick={onGoogle} className="w-full">
          Continue with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium underline underline-offset-2">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
