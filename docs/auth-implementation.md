# Gantto 認証実装ガイド

共有パスワード1個で全ルート保護する認証システムの実装仕様。
PBKDF2-SHA256 + HMAC署名Cookie + タイミングセーフ比較。

## 設計概要

### アーキテクチャ

```
[ブラウザ]
   ↓ リクエスト
[proxy.ts] ← 全リクエストの前段で認証チェック
   ↓ Cookie検証
   ├─ OK → 通す
   └─ NG → /login にリダイレクト
       ↓
   [/login (page.tsx)]
       ↓ パスワード入力 → POST /api/auth
   [/api/auth (route.ts)]
       ↓ PBKDF2 で照合 → HMAC署名Cookie発行
   [元のページにリダイレクト]
```

### セキュリティ要件

- パスワードは PBKDF2-SHA256（10万回反復）でハッシュ化して環境変数に保存
- パスワード比較は `timingSafeEqual` で定数時間（タイミング攻撃対策）
- セッションCookieは HMAC-SHA256 で署名（改ざん検知）
- Cookie は `httpOnly`, `secure` (本番時), `sameSite=strict` (CSRF対策)
- セッション有効期限7日
- ログイン失敗時は200ms遅延を入れる（タイミング情報を漏らさない）

### ランタイム分担

| ファイル | Runtime | 理由 |
|---|---|---|
| `proxy.ts` | Edge | リクエストごとに毎回走るので軽量である必要、Web Crypto APIで完結 |
| `app/api/auth/route.ts` | Node.js | `pbkdf2Sync` がNode API、Edgeでは動かない |
| `scripts/hash-password.ts` | Node.js (tsx) | ローカル実行のみ、ハッシュ生成1回限り |

## 環境変数

`.env.local`（gitignore済み）に以下を設定：

```bash
AUTH_PASSWORD_HASH=<PBKDF2ハッシュ>  # scripts/hash-password.ts で生成
AUTH_SECRET=<64文字hex>              # node -e で生成
```

`AUTH_SECRET` の生成コマンド：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## ファイル一覧

実装するファイルは5つ：

1. `.env.local` — 環境変数（ハッシュとシークレット）
2. `scripts/hash-password.ts` — パスワードハッシュ生成スクリプト（1回だけ実行）
3. `proxy.ts` — 全ルート保護のミドルウェア（Next.js 16の新名称）
4. `app/api/auth/route.ts` — ログイン/ログアウトAPI
5. `app/login/page.tsx` — ログインフォームUI

---

## 1. `scripts/hash-password.ts`

パスワードを PBKDF2-SHA256 でハッシュ化して、`.env.local` に貼り付け可能な形式で出力。フォーマットは `iterations:salt(hex):hash(hex)`。

```ts
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("Enter password (16+ chars): ");
  rl.close();

  if (password.length < 16) {
    console.error("\n❌ Password must be at least 16 characters.");
    process.exit(1);
  }

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);

  const encoded = `${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;

  console.log("\n✅ Hash generated. Copy this value to .env.local:\n");
  console.log(`AUTH_PASSWORD_HASH=${encoded}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

実行コマンド：
```bash
pnpm dlx tsx scripts/hash-password.ts
```

---

## 2. `proxy.ts`（プロジェクトルート）

Next.js 16 の新ファイル名（旧 `middleware.ts`）。Edge Runtime で全リクエストの前段で動き、Cookie の HMAC 署名を検証して認証する。

```ts
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "gantto_session";
const PUBLIC_PATHS = ["/login", "/api/auth"];

async function verifySession(token: string, secret: string): Promise<boolean> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  // 有効期限チェック
  try {
    const decoded = JSON.parse(atob(payload));
    if (typeof decoded.exp !== "number" || Date.now() > decoded.exp) {
      return false;
    }
  } catch {
    return false;
  }

  // HMAC署名検証
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureBytes = Uint8Array.from(
    atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(payload)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 静的アセット素通し
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next();
  }

  // 公開パス素通し
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 認証チェック
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("AUTH_SECRET is not set");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifySession(token, secret))) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

---

## 3. `app/api/auth/route.ts`

ログイン（POST）とログアウト（DELETE）の API。Node.js Runtime で `pbkdf2Sync` + `timingSafeEqual` を使う。

```ts
import { NextResponse } from "next/server";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "gantto_session";
const SESSION_DURATION_DAYS = 7;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export const runtime = "nodejs";

function verifyPassword(password: string, encodedHash: string): boolean {
  const parts = encodedHash.split(":");
  if (parts.length !== 3) return false;

  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");
  const computedHash = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);

  if (computedHash.length !== expectedHash.length) return false;
  return timingSafeEqual(computedHash, expectedHash);
}

async function createSession(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;
  const payload = btoa(JSON.stringify({ exp }));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${payload}.${signature}`;
}

export async function POST(req: Request) {
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
  const secret = process.env.AUTH_SECRET;

  if (!passwordHash || !secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = body?.password;
  if (typeof password !== "string") {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  if (!verifyPassword(password, passwordHash)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSession(secret);

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
```

---

## 4. `app/login/page.tsx`

ログインフォームUI。shadcn/ui の Button を使うのでまず Input コンポーネントを追加する：

```bash
pnpm dlx shadcn@latest add input label
```

実装：

```tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      router.push(from);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">gantto</h1>
          <p className="text-sm text-muted-foreground">
            Enter the shared password to continue.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading || !password} className="w-full">
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
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
```

`useSearchParams` は Suspense でラップする必要があるため、`LoginPage` をエクスポート用のコンテナとして定義し、内部の `LoginForm` でフックを使う。

---

## 動作確認手順

1. `.env.local` の値が3つ揃ってることを確認（`AUTH_PASSWORD_HASH`, `AUTH_SECRET`, `GITHUB_PROJECT_OWNER`）
2. `pnpm dev` でサーバー起動
3. `http://localhost:3001` を開く
4. `/login?from=/` にリダイレクトされる
5. パスワード入力してログイン
6. `/` にリダイレクトされて Next.js のスタート画面が表示される
7. ブラウザの DevTools → Application → Cookies で `gantto_session` Cookie が発行されてるのを確認

ログアウト確認は DevTools の Console から：
```js
fetch("/api/auth", { method: "DELETE" }).then(() => location.reload())
```

---

## セキュリティ自己チェックリスト

- [ ] `.env.local` が `.gitignore` に含まれている
- [ ] パスワードは16文字以上
- [ ] `AUTH_SECRET` は `crypto.randomBytes(32)` で生成
- [ ] PBKDF2 反復回数は10万回以上
- [ ] パスワード比較は `timingSafeEqual` を使用
- [ ] HMAC署名で Cookie 改ざん検知
- [ ] Cookie に `httpOnly`, `sameSite=strict` を設定
- [ ] 本番環境では `secure: true`（自動切り替え済み）
- [ ] ログイン失敗時に遅延を挿入（タイミング情報を漏らさない）

---

## 既知の制限と将来対応

| 項目 | 現状 | 対応予定 |
|---|---|---|
| ログイン試行回数制限 | なし | v1.1（rate limit） |
| パスワードリセット | なし（再ハッシュ生成 + 環境変数更新） | 不要（個人用途） |
| 個別ユーザー管理 | なし（共有1パスワード） | v1.1以降 |
| 2FA | なし | v1.1以降検討 |
