"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Forgot password — step 1.
 *
 * Sends a 6-digit OTP code to the supplied email address via Neon Auth's
 * built-in email delivery. Then redirects to /reset-password where the user
 * enters the OTP + new password.
 *
 * IMPORTANT: To avoid user-enumeration leaks, we always show the same
 * confirmation message regardless of whether the email exists in the system.
 */
function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Fire-and-forget the OTP request. We intentionally do NOT differentiate
    // between "success" and "no such user" in the UI — that leak gives
    // attackers a free user-enumeration oracle. The actual response is only
    // used to track failures in Sentry; the user always sees the same screen.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (authClient as any).forgetPassword.emailOtp({ email });
    } catch {
      // Swallow — failures are observability concerns, not user concerns.
      // (Real network errors will still surface as a Sentry event via
      // the global onRequestError handler.)
    }
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              Check your email
            </h1>
            <p className="text-sm text-muted-foreground">
              該当するアカウントがある場合、リセット用の 6 桁コードをメールでお送りしました。
              数分待ってもメールが届かない場合は、迷惑メールフォルダを確認してください。
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
              コードを入力する
            </Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline underline-offset-2">
              ログインに戻る
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            パスワードをリセット
          </h1>
          <p className="text-sm text-muted-foreground">
            登録時のメールアドレスを入力すると、6 桁のリセットコードを送信します。
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          <Button
            type="submit"
            disabled={loading || !email}
            className="w-full"
          >
            {loading ? "送信中..." : "リセットコードを送る"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-2">
            ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
