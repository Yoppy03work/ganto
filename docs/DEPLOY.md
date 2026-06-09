# Vercel デプロイ手順

ganto を Vercel + Neon Postgres + Neon Auth で公開する手順。

## 前提

- `pnpm build` がローカルで通っている (本リポジトリで確認済み)
- Neon プロジェクト「ganto」が作成済み・Auth 有効化済み
- Vercel アカウント

## 1. リポジトリを GitHub に push

このプロジェクトを GitHub の任意のリポジトリへ push しておく。

> **注意**: `.env*` は `.gitignore` 済み。`certificates/` も除外済み。
> 認証情報やキーをうっかり commit しないこと。

## 2. Vercel でプロジェクトを Import

1. https://vercel.com/new
2. GitHub リポジトリを選択
3. **Framework Preset**: Next.js (自動検出)
4. **Root Directory**: `ganto/ganto` (リポジトリ内の Next.js プロジェクトの場所)
5. **Build Command**: `pnpm build` (デフォルト)
6. **Install Command**: `pnpm install`
7. **Output Directory**: `.next` (デフォルト)

## 3. 環境変数を設定

Vercel の Project Settings → Environment Variables に以下を入れる。
全て **Production / Preview / Development** にチェック。

| 変数 | 値の出所 |
|---|---|
| `DATABASE_URL` | Neon Console → Connection details → Pooled connection |
| `NEON_AUTH_BASE_URL` | Neon Console → Auth タブ → Configuration |
| `NEON_AUTH_COOKIE_SECRET` | `openssl rand -base64 32` で新しく生成 (本番用) |
| `GANTT_START_FIELD` | 任意。GitHub Projects v2 の Date フィールド名（デフォルト `Start`） |
| `GANTT_END_FIELD` | 任意。同上（デフォルト `End`） |
| `APP_URL` | デプロイ後の URL (招待リンクの絶対 URL に使う) — `https://<project>.vercel.app` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry → Project Settings → Client Keys (DSN) |
| `SENTRY_DSN` | 同上（同じ値でよい。サーバー側 init で使う） |
| `SENTRY_AUTH_TOKEN` | Sentry → Account → Auth Tokens（source-maps upload 用） |
| `SENTRY_ORG` | Sentry の Organization slug |
| `SENTRY_PROJECT` | Sentry の Project slug |
| `BLOB_READ_WRITE_TOKEN` | 任意。Vercel Blob ストレージのトークン（タスクのファイル添付用）。未設定なら添付機能が「ストレージ未設定」で無効化される（fail-soft） |
| `RESEND_API_KEY` / `EMAIL_FROM` | 任意。@メンション / アサイン通知のメール送信用。未設定なら in-app 通知のみ（メールは no-op） |

**`AUTH_PASSWORD_HASH` / `AUTH_SECRET` は不要** (旧 shared password 認証の名残で未使用)。
**`GITHUB_PAT` も不要** — GitHub Projects v2 同期は **ganto-managed OAuth** に移行済み。各ユーザーが `/account` から自分の GitHub アカウントを Connect します。

GitHub Projects v2 同期を使う場合に追加で必要な env vars (詳細は `docs/GITHUB-OAUTH.md`):

| 変数 | 値 |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | ganto 用 GitHub OAuth App の Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | 同上の Client Secret |

**メール配信について**: パスワードリセットは **Neon Auth の OTP メール配信**を利用するため、本リリースでは Resend など外部メールプロバイダの設定は不要。詳細は `docs/EMAIL.md` 参照。
（`resend` パッケージは将来の通知機能用に pre-installed 済みだが、現時点では参照されていない。）

詳細:
- Sentry の運用ポリシーは `docs/SENTRY.md` 参照（dev は `SENTRY_TEST_MODE=true` で opt-in）
- GitHub OAuth の設定手順は `docs/GITHUB-OAUTH.md` 参照

## 4. Neon Auth の Allowed Origins を追加

Neon Console → Auth → Configuration:

- **Allowed Origins** に Vercel の URL を追加 (例: `https://ganto.vercel.app`)
- preview deployment 用に `https://*.vercel.app` を追加するか、preview ごとに個別に追加

これをやらないと Vercel ドメインから Auth API を叩いた時に CORS エラーで弾かれる。

## 5. データベースマイグレーション

初回デプロイ前に、ローカルから本番 DB にマイグレーションを適用しておく。

```bash
# .env.local の DATABASE_URL を一時的に本番 URL に書き換えて実行
pnpm db:migrate
pnpm db:seed   # built-in roles を投入
```

または Neon の **branching** を使い、preview 用の dev branch を別途作って先に migrate する手もある。

## 6. デプロイ

Vercel 上の "Deploy" を押す。push のたびに自動で再デプロイされる。

## 7. 動作確認

1. デプロイ後の URL にアクセス → `/login` にリダイレクト
2. サインアップ
3. Project 作成 → サンプルタスク10件投入
4. Gantt 表示
5. 別アカウントで招待リンク経由で参加してメンバー追加

## 既知の制限

- **Edge runtime 不使用**: 認証 / DB を含む API ルートは `runtime = "nodejs"`。Edge を有効化すると Drizzle + Neon HTTP driver の組み合わせで挙動が変わる可能性あり、未検証
- **`pnpm db:push` は使わない**: Drizzle Kit の対話 prompt が CI で動かない。`db:generate` + `db:migrate` を使う
- **本番用 Cookie**: `NODE_ENV=production` の Vercel 環境では Cookie が `secure` で発行される。HTTPS 専用ドメインなので問題なし
- **`__Secure-` プレフィックス cookie**: HTTPS なら問題なし。ローカル開発時のみ HTTPS が必要 (`pnpm dev` で `--experimental-https`)

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| ログイン後 / にリダイレクトループ | `NEON_AUTH_BASE_URL` の値間違い、または Neon Auth が無効化されている |
| サインアップで 500 | `DATABASE_URL` の値、または Neon Auth allowed origins に Vercel URL が無い |
| 招待リンクが `localhost` を含む | `APP_URL` が未設定。Production env に設定する |
| GitHub Pull/Push で 412 GITHUB_NOT_CONNECTED | `/account` で GitHub アカウントを Connect してから再試行 |
| GitHub Pull/Push で 400 | 接続したアカウントが当該 Project へのアクセス権を持っていない、または Owner/Number 間違い。詳細は `docs/GITHUB-OAUTH.md` |
