"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Reset password — step 2.
 *
 * Accepts email + 6-digit OTP + new password. The email is normally pre-filled
 * via `?email=` from the forgot-password flow, but is also editable so a user
 * who arrives directly with their OTP can still finish.
 *
 * Better Auth API: `emailOtp.resetPassword({ email, otp, password })`.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!email) return "メールアドレスを入力してください";
    if (!/^\d{4,8}$/.test(otp)) return "コードは 6 桁の数字です";
    if (password.length < 8) return "パスワードは 8 文字以上にしてください";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return "パスワードには英字と数字を含めてください";
    }
    if (password !== confirm) return "確認用パスワードが一致しません";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (authClient as any).emailOtp.resetPassword({
        email,
        otp,
        password,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errObj = (res as any)?.error;
      if (errObj) {
        const code = errObj.code ?? errObj.status ?? "";
        if (String(code).toLowerCase().includes("invalid")) {
          setError("コードが無効か、期限切れです。もう一度コードを取得してください。");
        } else {
          setError(errObj.message ?? "リセットに失敗しました");
        }
        setLoading(false);
        return;
      }
      setSuccess(true);
      // Allow the user to read the success message before bouncing to /login.
      setTimeout(() => window.location.assign("/login"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ネットワークエラー";
      setError(msg);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            パスワードを更新しました
          </h1>
          <p className="text-sm text-muted-foreground">
            ログイン画面に移動します...
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
            新しいパスワードを設定
          </h1>
          <p className="text-sm text-muted-foreground">
            メールで受け取った 6 桁のコードと、新しいパスワードを入力してください。
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="otp">6 桁のコード</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              autoFocus
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">新しいパスワード</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              8 文字以上、英字 + 数字を含む
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">パスワード（確認）</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading || !email || !otp || !password || !confirm}
            className="w-full"
          >
            {loading ? "更新中..." : "パスワードを更新"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          コードがない場合は{" "}
          <Link
            href="/forgot-password"
            className="underline underline-offset-2"
          >
            もう一度リクエスト
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
