# Sentry 運用ガイド

## 概要

ganto は Sentry でエラーを監視している。導入は **送信ポリシーが環境ごとに厳密に分かれている**点が特殊なので、ローカル検証時に「あれ、Sentry に出ない」とならないよう本書を確認のこと。

## 構成

| ファイル | 役割 |
|---|---|
| `instrumentation.ts` | Next.js entry。`NEXT_RUNTIME` に応じて server / edge 設定を読み込む。`onRequestError` で App Router のエラーを自動キャプチャ。 |
| `instrumentation-client.ts` | クライアント側 init。`onRouterTransitionStart` でナビゲーション計測。 |
| `sentry.server.config.ts` | Node ランタイム用 init（薄いラッパー） |
| `sentry.edge.config.ts` | Edge ランタイム用 init（薄いラッパー） |
| `lib/observability/sentry-shared.ts` | **3 ランタイム共通の設定本体**。`applySentryCommonConfig()` がここ |
| `next.config.ts` | `withSentryConfig` で source maps upload + tunnel route |

## 送信ポリシー

| 環境 | `VERCEL_ENV` | 送信 | サンプル率 |
|---|---|---|---|
| production | `production` | 常時 | 0.2 |
| preview (Vercel) | `preview` | 常時 | 1.0 |
| dev (ローカル) | undef | **デフォルト OFF** | — |
| dev 検証時 | undef + `SENTRY_TEST_MODE=true` | ON | 1.0 |

DSN が未設定なら全環境で送信されない（Sentry の init エラー回避のため）。

## 環境変数

| 変数 | 用途 | 必須 |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | クライアント側 DSN | preview / production |
| `SENTRY_DSN` | サーバー側 DSN（同じ値で OK） | preview / production |
| `SENTRY_AUTH_TOKEN` | source maps upload 用 | production |
| `SENTRY_ORG` / `SENTRY_PROJECT` | source maps upload 用 | production |
| `SENTRY_TEST_MODE` | ローカル検証時のみ `true` | optional |
| `SENTRY_VERBOSE_BUILD` | ビルドログを冗長にしたい時 `true` | optional |

## PII scrub

`sentry-shared.ts` の `scrubPii` が `beforeSend` でフィルタする:

- `request.cookies` → 削除
- `request.headers.authorization` / `cookie` / `set-cookie` → 削除
- `user.email` / `user.ip_address` → 削除
- メッセージ・例外文字列中の email → `[email-redacted]` に置換

`sendDefaultPii: false` も指定済み。

## ローカルで動作確認したい時

1. `.env.local` に DSN を入れる:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
   SENTRY_DSN=...同じ値
   SENTRY_TEST_MODE=true
   ```
2. 任意の API ルートに一時的に `throw new Error("sentry test")` を入れる
3. `pnpm dev` でアクセス → Sentry ダッシュボードに出ることを確認
4. `SENTRY_TEST_MODE` を `false` に戻す、テストエラーも削除

## アラートルール（Sentry ダッシュボードで設定）

実務投入後に以下を Sentry プロジェクトの Alerts で作成:

| ルール | 条件 | 通知先 |
|---|---|---|
| Production new error | `environment:production` で初回発生 | 担当メール |
| 5xx surge | `environment:production` で 5 分以内に 10件以上 | 担当メール |
| Known error resurfaced | resolved 済みのエラーが再発 | 担当メール |
| Email send failure | event message に `password_reset_email_failed` を含む | 担当メール |

## デプロイ時

Vercel に push すれば `withSentryConfig` が自動で source maps を upload する。
release tag は `VERCEL_GIT_COMMIT_SHA` を自動で使う。手動操作は不要。

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| ローカルで Sentry に出ない | `SENTRY_TEST_MODE=true` が未設定。あるいは DSN 未設定 |
| ビルド時に `Failed to upload source maps` | `SENTRY_AUTH_TOKEN` が未設定 or 期限切れ |
| クライアントエラーがブロックされる | ad-blocker が `/api/sentry/*` をブロック → `tunnelRoute: "/monitoring"` 経由なので影響なし |
| `instrumentation.ts is not registered` | Next.js のバージョン確認（15+ 必須） |

## メンテナンス

- Sentry SDK のメジャーアップは半年に 1 回程度確認
- PII scrub のフィルタは新しい個人情報フィールドが増えたら追加
- アラート通知先は担当者交代時に必ず更新
