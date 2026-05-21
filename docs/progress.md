# ganto 実装進捗

最終更新: 2026-05-13 — Phase 7（実務投入クリティカル4 Epic）完成

## ゴール

- ハッカソン用ガントチャート Web アプリ
- データソース: 自前 Postgres (Local) + GitHub Projects v2 連携 (オプション)
- 認証: Neon Auth (Better Auth) — メール/パスワード + Google OAuth
- 設計バンドル: `/tmp/gantto-design/untitled/project/`
- デプロイ目標: Vercel + Neon

## スタック

- Next.js 16.2.4 (App Router, Turbopack), React 19.2.4
- Tailwind CSS v4 + shadcn/ui (style: `radix-nova`, baseColor: `neutral`)
- Drizzle ORM + Neon Postgres (HTTP driver)
- Neon Auth `@neondatabase/auth` 0.3.0-beta (Better Auth)
- @octokit/graphql (GitHub Projects v2 連携)
- ローカルは HTTPS 必須: `next dev --experimental-https -p 3002` (Neon Auth の `__Secure-` cookie のため)

## 環境変数 (.env.local)

| 変数 | 用途 |
|---|---|
| `AUTH_PASSWORD_HASH` / `AUTH_SECRET` | 旧 shared password 認証の名残（未使用） |
| `DATABASE_URL` | Neon Postgres (Pooled) |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` | Neon Auth |
| `GITHUB_PAT` | GitHub Projects v2 sync 用（`project` read scope 必要） |
| `GITHUB_PROJECT_OWNER` | デフォルト owner（プロジェクト個別設定が優先） |
| `GANTT_START_FIELD` / `GANTT_END_FIELD` | GitHub Projects のカスタム Date フィールド名 |

## 実装済み（全 Phase）

### Phase 0: 認証基盤 ✅
- Neon Auth（Better Auth）+ proxy.ts ページガード + permission helper
- `/login` `/signup` ページ（email + Google OAuth）
- 動作確認済み（HTTPS 必須、mkcert 導入済み）

### Phase 1: プロジェクト ✅
- 作成 / 一覧 / 詳細 / 設定 (rename / storage_mode / delete)
- 作成時にビルトイン4ロールをクローン + Owner membership 自動作成
- 動作確認済み

### Phase 2: メンバー / ロール ✅
- Members 一覧 (Server) + テーブル編集 (Client)
- ロール変更 / 削除（Owner 不可、自己離脱可）
- カスタムロール作成 + 権限マトリクス UI
- 招待リンク (POST /invitations) + 受諾フロー (`/invite/[token]`) + Neon Auth user_sync 1秒ポーリングで race fix

### Phase 3: ガント本体 ✅
- ✅ `lib/gantt/date.ts` — DAY_PX / ROW_H / `dateToPx` / `buildDayHeader` / `autoWindow` / `todayPx`
- ✅ `lib/projects/sample-tasks.ts` — 10件のサンプル、`createProject` から自動投入
- ✅ Tasks API (CRUD + reorder)
- ✅ Gantt 各コンポーネント (date-header / task-row / gantt-bar / today-line / timeline-grid)
- ✅ Pointer-event D&D（move / resize、楽観更新）
- ✅ HTML5 D&D で行入れ替え（margin transition で滑らか）
- ✅ 祝日 = 日曜 tint（`lib/gantt/holidays.ts` 2025-2027 日本の祝日）
- ✅ アラインメント修正（左ペーンに HEADER_H filler、右ペーン単一 scroll container、DateHeader に explicit width）
- ✅ Hydration mismatch 解決（`useSyncExternalStore` で TodayLine をクライアントマウント後のみ）

### Phase 4: コラボ機能 ✅
- ✅ コメント API + サイドパネル内スレッド
- ✅ アサイニー API (PUT/DELETE per user)
- ✅ タスク詳細サイドパネル (slide-in、全フィールド編集、削除、コメント、Blocked by 編集)
- ✅ 監査ログ画面 `/p/[id]/audit` (アクション辞書 + before/after JSON 折りたたみ)
- ✅ 依存関係 API + cycle 検出
- ✅ Gantt に依存矢印 SVG（L-shape、CP は赤実線）+ クリティカルパス outline + ヘッダの Arrows / Critical path トグル

### Phase 5: ポリッシュ ✅
- ✅ CSV import/export（merge / replace）
- ✅ ズームスケール（Day / Week / Month、segment toggle）

### Phase 6: GitHub-backed mode ✅（双方向同期）
- ✅ `lib/github/client.ts` — PAT ベースの Octokit GraphQL クライアント
- ✅ `lib/github/projects.ts` — `fetchProjectV2` (user / org 自動判定)
- ✅ `lib/github/mutations.ts` — `addDraftIssue` + `updateItemField` mutations
- ✅ `lib/projects/github-sync.ts`
  - `pullFromGitHub` — Status + 設定可能 Date フィールド → tasks に upsert、`external_id` で追跡
  - `pushToGitHub` — local tasks の Status / Start / End を GitHub に書き戻し。`external_id` 無しの local-only タスクは `addProjectV2DraftIssue` で新規作成して `external_id` を保存
- ✅ API: `/api/projects/[id]/github/pull` POST + `/api/projects/[id]/github/push` POST
- ✅ Settings ページの GitHub sync セクションに「Pull from GitHub」「Push to GitHub」両ボタン
- ✅ ブラウザで Settings 画面の UI 確認済み (`storageMode = "github"` 時に sync セクション表示)

### Vercel デプロイ準備 ✅
- ✅ `vercel.json` — framework=nextjs, buildCommand, installCommand
- ✅ `docs/DEPLOY.md` — 環境変数一覧 + Neon Auth allowed origins + migration 手順 + トラブルシューティング表
- ✅ Production build (`pnpm build`) 通過確認
- ❌ 実際の Vercel デプロイは未実行（ユーザー側の作業）

### Phase 7: 実務投入クリティカル4 Epic ✅（2026-05-13）

「ハッカソン作品」を「実務で使えるツール」に化けさせるための地雷除去フェーズ。
PM レビューを2周経て確定した4 Epic を順次実装。

#### Epic 1: Observability & Security Baseline ✅
- ✅ `@sentry/nextjs` 導入（`instrumentation.ts` / `instrumentation-client.ts` / `sentry.{server,edge}.config.ts`）
- ✅ `lib/observability/sentry-shared.ts` — 全ランタイム共通の init ロジック（PII scrub / 環境ごとの sample 率 / dev は SENTRY_TEST_MODE で opt-in）
- ✅ `next.config.ts` を `withSentryConfig` でラップ（DSN/auth-token 未設定時はパススルー）
- ✅ `docs/SENTRY.md` — 運用ガイド + alert ルール
- ✅ `docs/security-audit.md` — 全 33 API ルートの認証/認可監査結果
- ✅ `.github/pull_request_template.md` — チェックリストで将来の劣化防止
- ✅ `docs/OPS-CHECKLIST.md` — 初回デプロイ前 / 毎リリース / 緊急対応 / 月次の手順

#### Epic 2: Password Reset ✅
- ✅ Neon Auth の OTP ベース（`forgetPassword.emailOtp` + `emailOtp.resetPassword`）を採用
- ✅ `app/forgot-password/page.tsx` — メアド入力 + **ユーザー列挙対策**（応答は常に同じ文言）
- ✅ `app/reset-password/page.tsx` — メアド + OTP + 新パスワード入力（強度バリデーション付き）
- ✅ `/login` に "Forgot password?" リンク
- ✅ `proxy.ts` に `/forgot-password` / `/reset-password` を public 経路に追加
- ✅ `docs/EMAIL.md` — Neon Auth メール配信 + 将来の Resend 切替ガイド
- ✅ `resend` パッケージは将来用にインストール済み（通知メールに使う）

#### Epic 3: Optimistic Concurrency Control ✅（silent data loss 防止）
- ✅ `lockVersion integer DEFAULT 0` カラム × 4 tables (`tasks`, `projects`, `roles`, `memberships`)
- ✅ `lib/concurrency/optimistic-lock.ts` — `ConflictError` / `ensureUpdated` / `conflictResponse` / `missingLockVersionResponse`
- ✅ PATCH 4本に楽観ロック適用:
  - `/api/projects/[id]` (project update)
  - `/api/projects/[id]/tasks/[taskId]` (task update)
  - `/api/projects/[id]/roles/[roleId]` (role update)
  - `/api/projects/[id]/members/[userId]` (membership update)
- ✅ `expectedLockVersion` 未指定 → 400 `MISSING_LOCK_VERSION` で fail-loud
- ✅ Reorder route を **transaction + 全件 version 検証** に変更（部分成功絶対無し）
- ✅ クライアント側 (`gantt-screen.tsx`, `task-sidepanel.tsx`, `settings-form.tsx`, `members-table.tsx`, `role-editor.tsx`):
  - 全 PATCH に `expectedLockVersion` を含める
  - 409 で sonner toast「他のユーザーが先に変更しました」+ ロールバック + 再フェッチ
- ✅ `GanttTaskDTO` / `ProjectMember` / `Role` 型に `lockVersion` 追加

#### Epic 4: Soft Delete & Trash（tasks MVP）+ Project hard delete 無効化 ✅
- ✅ `tasks` に `deletedAt` + `deletedByUserId` カラム + 複合インデックス `tasks_project_deleted_idx`
- ✅ `lib/projects/tasks.ts` — `deleteTask` を soft delete に / `restoreTask` 新規（**末尾 position に復元**）/ `listTrash` 新規
- ✅ 全 task SELECT に `isNull(deletedAt)` フィルタ:
  - `lib/projects/tasks.ts` / `dependencies.ts` / `comments.ts` / `csv.ts` / `github-sync.ts`
  - `app/api/projects/[id]/tasks/reorder/route.ts`
- ✅ CSV `replace` モードも hard delete → soft delete に変更
- ✅ 新規 API:
  - `GET /api/projects/[id]/trash` — soft-deleted タスク一覧（削除者付き）
  - `POST /api/projects/[id]/tasks/[taskId]/restore` — 末尾 position に復元
- ✅ 新規ページ: `/p/[projectId]/trash` (Server Component + `TrashList` Client Component)
- ✅ ガントヘッダに "Trash" リンク追加
- ✅ **Project hard delete を完全無効化**:
  - API: `ALLOW_PROJECT_DELETE=true` 未設定なら 503 + `project.delete.blocked` を audit log に記録
  - UI: `DangerZone` を「削除不可」の説明書きに置き換え（緊急時の運用手順は OPS-CHECKLIST 参照）

#### Migration
- `db/migrations/0001_sticky_vanisher.sql` — 全 lockVersion + tasks の deletedAt/deletedByUserId/index
- 本番 DB に適用済み (`pnpm db:migrate`)

#### 検証
- `pnpm lint` クリーン
- `pnpm build` 通過（28 → 31 ルート、`/forgot-password` / `/reset-password` / `/p/[id]/trash` 等が追加）
- 残りはユーザーによるブラウザ確認（2タブで同タスクをドラッグ → 409 toast、Trash → Restore など）

### Phase 8: 機能拡充 一気実装（2026-05-20）

「2FA/TOTP・SSO(SAML/OIDC)・30日経過後の hard delete cron 以外すべて」を実装するフェーズ。
9 本のレビュー可能な PR (#7〜#15) に分割し、各 PR で lint + build + Vercel CI 通過 + Codex レビュー対応を行い、自律で develop にマージ。

#### GitHub OAuth: self-hosted 化（PR #5）
- ✅ Neon Auth の `linkSocial` がプロキシ + 独自 OAuth キーのクロスドメイン Cookie 問題で `state_mismatch` → **自前 OAuth フロー**に移行
- ✅ `githubUserTokens` テーブル + `/api/github/oauth/{start,callback}` + CSRF state Cookie
- ✅ token 保存は `onConflictDoUpdate`（neon-http は `db.transaction()` 非対応のため）
- ✅ 各ユーザーが `/account` から自分の GitHub を Connect（shared PAT 廃止）

#### UX クイックウィン（PR #7）
- ✅ Warning パネル（overdue / due soon）`warning-button.tsx`
- ✅ タスク検索 / フィルタ `gantt-filter.tsx`
- ✅ ヘルプ / キーボードショートカット dialog `help-dialog.tsx`
- ✅ タスク変更履歴 `task-history.tsx`（audit_log ベース）/ ツールチップ `ui/tooltip.tsx`

#### Quarter / Year スケール（PR #8）
- ✅ Day / Week / Month に加え **Quarter / Year** ズームスケールを追加

#### PM 可視化（PR #9）
- ✅ マイルストーン `milestones` + `milestone-layer.tsx`
- ✅ ベースライン（計画 vs 実績）`baselines` / `baseline_tasks`
- ✅ リソースビュー / PM コントロール `pm-controls.tsx`

#### 通知（PR #10）
- ✅ in-app 通知 `notifications` + `notification-bell.tsx`
- ✅ @メンション / アサイン通知（メールは `RESEND_API_KEY` 設定時のみ、未設定なら in-app のみ）

#### ファイル添付（PR #11）
- ✅ Vercel Blob (`@vercel/blob`) でタスクに添付 `attachments` + `task-attachments.tsx`
- ✅ `BLOB_READ_WRITE_TOKEN` 未設定なら fail-soft（添付機能のみ無効化）
- ✅ Codex P1 修正: `deleteAttachment` を `taskId` スコープに（own 権限での他タスク添付削除を防止）

#### 生産性（PR #12）
- ✅ タスクテンプレート `task_templates` + `templates-manager.tsx`
- ✅ 繰り返しタスク `task-repeat.tsx`
- ✅ 依存の自動シフト `lib/projects/cascade.ts`（`shiftDownstream` BFS、neon-http のため逐次更新）

#### エクスポート / 共有（PR #13）
- ✅ PNG / PDF エクスポート（html-to-image + jspdf）`export-menu.tsx`
- ✅ 共有リンク `share_tokens` + `share-manager.tsx` + 公開読み取り専用 `/share/[token]`
- ✅ 進捗レポート

#### クロスプロジェクト（PR #14）
- ✅ My tasks 横断ビュー `lib/projects/my-tasks.ts` + `project-switcher.tsx`
- ✅ Codex P1 修正: membership INNER JOIN (status=active) で離脱済みプロジェクトのタスク漏洩を防止

#### セキュリティ / 運用（PR #15）
- ✅ Project soft delete + 復元 `lib/projects/project-trash.ts` + `deleted-projects.tsx`（`/api/projects/[id]` DELETE を soft delete に、`/restore` 追加）
- ✅ Rate limiting `lib/rate-limit.ts`（in-memory fixed-window、auth POST に 10/5min per IP+path、fail-open）
- ✅ セッション管理 `/account` + `sessions-panel.tsx`（`auth.listSessions()` / `auth.revokeSession()`）

#### Migration（Phase 8）
- `0003` github_user_tokens / `0004` milestones+baselines / `0005` notifications / `0006` attachments / `0007` task_templates / `0008` share_tokens / `0009` projects soft delete
- 本番 DB に適用済み

#### スコープ外（明示的に未実装）
- 2FA / TOTP
- SSO (SAML / OIDC)
- 30 日経過後の hard delete cron

#### 検証
- 全 PR で `pnpm lint` / `pnpm build` / Vercel CI 通過、Codex P1 セキュリティ指摘は修正してマージ
- 残りはユーザーによるブラウザ確認 + オプション env var 設定（`GITHUB_OAUTH_CLIENT_ID/SECRET`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY/EMAIL_FROM`）

### 動作確認済みフロー

- サインアップ → ログイン → ログアウト → Google OAuth
- プロジェクト作成 → 一覧 → 削除
- メンバー招待 → 受諾 → ロール変更 → 削除
- カスタムロール作成 → 権限編集 → 削除
- タスク作成（ダイアログ）→ ガント表示 → ドラッグ移動 → リサイズ → 並び替え
- サンプル: 10件タスクを自動投入

### 未確認（コード書いた、ブラウザ確認待ち）

- タスクサイドパネル + コメント
- 依存矢印 + Critical Path 表示
- 監査ログ画面
- CSV import / export
- ズームスケール (Week / Month)
- GitHub pull sync（要 GITHUB_PAT 設定 + Project + Status/Start/End フィールド）

## アーキテクチャ上の落とし穴 (引き継ぎ向け)

1. **`proxy.ts` は API ルートをスキップ** — Neon Auth Beta middleware が POST API を一律でリダイレクトする回避策
2. **`memberships.user_id` は text、`neon_auth.user.id` は uuid** → JOIN 時に `::uuid` キャスト必須（lib/projects 内の sql テンプレで使用）
3. **`server-only` 注意** — pure JS 関数はクライアントから import される可能性あり、別ファイルに分けて `server-only` を付けない（例: `lib/gantt/critical-path.ts` ↔ `lib/projects/dependencies.ts`）
4. **Hydration**: `now` は `useSyncExternalStore` で SSR/client 切り分け、TodayLine は mount 後のみ
5. **Form**: `noValidate` + `autoComplete="off"` で Safari 暗黙 pattern 回避
6. **Fetch**: 必ず `credentials: "same-origin"`
7. **react-hooks/set-state-in-effect**: useEffect 内で同期 setState 不可。代替は `useSyncExternalStore` か `key` prop で remount

## DB スキーマ (db/schema.ts)

主要テーブル:
- `projects` (storage_mode 'local'|'github', github_owner, github_project_number)
- `roles` (project_id NULL = built-in template; プロジェクト作成時にクローン)
- `permissions` (role_id, capability text, scope 'all'|'own')
- `memberships` (project_id, user_id text [Neon Auth UUID], role_id, status)
- `invitations` (token, expires_at, used_at, used_by)
- `tasks` (status, type, start_at, end_at, progress, visibility, position, external_id [GitHub アイテム ID])
- `task_assignees` (composite PK)
- `task_dependencies` (composite PK, fromTaskId → toTaskId)
- `audit_log` (action dotted, target_type, before/after JSONB)
- `comments` (task_id, author_id, body)
- `neonAuthSchema.user` — Neon Auth 同期テーブル（読み取り専用 mirror）

## 開発コマンド

```bash
cd /Users/yoppy/with_claude/myapp/ganto/ganto
pnpm dev          # https://localhost:3002 起動
pnpm lint         # ESLint
pnpm build        # 本番ビルド + 型チェック (PASS 確認済み)
pnpm db:generate  # スキーマ → migration
pnpm db:migrate   # 適用
pnpm db:seed      # ビルトインロール seed
```

## 動作確認済みフロー（2026-05-09 ブラウザ検証）

- ✅ サインアップ → ログイン
- ✅ プロジェクト作成 → 10件サンプルタスク自動投入
- ✅ Gantt 表示（左右ペーン整列、Today 線、週末/祝日 tint、タスクバー status 色分け）
- ✅ Members 画面（Owner 表示、Invite member ボタン）
- ✅ Roles 画面（4 built-in、+ New role ボタン、permission chips）
- ✅ Audit log（project.create イベント記録）
- ✅ Settings → Storage = GitHub に切替 → Pull/Push 両ボタン表示

## 残タスク

- [x] ~~Hour / Halfday / Quarter スケール~~ → Quarter / Year を Phase 8 で追加
- [x] ~~Warning パネル（overdue / due soon）~~ → Phase 8 (PR #7)
- [x] ~~Project Tabs（複数プロジェクト同時表示）~~ → My tasks 横断ビュー + switcher を Phase 8 (PR #14)
- [x] ~~PDF / PNG export~~ → Phase 8 (PR #13)
- [ ] Vercel への実デプロイ（手順は `DEPLOY.md` に記載）
- [ ] SSO (SAML/OIDC) / 2FA・TOTP（Better Auth プラグインで対応可だが今回スコープ外）
- [ ] 30 日経過後の soft-deleted hard delete cron（今回スコープ外）

## ルート一覧（build 出力より）

```
/                                         home (project list)
/login  /signup                           auth
/invite/[token]                           invite acceptance
/p/[projectId]                            Gantt
/p/[projectId]/members                    member management
/p/[projectId]/roles                      role editor
/p/[projectId]/audit                      audit timeline
/p/[projectId]/settings                   project settings + GitHub sync

API:
/api/auth/[...path]                       Neon Auth proxy
/api/projects (GET/POST)
/api/projects/[id] (GET/PATCH/DELETE)
/api/projects/[id]/members (GET)
/api/projects/[id]/members/[userId] (PATCH/DELETE)
/api/projects/[id]/roles (GET/POST)
/api/projects/[id]/roles/[roleId] (PATCH/DELETE)
/api/projects/[id]/invitations (GET/POST)
/api/invitations/[token] (GET/POST)
/api/projects/[id]/tasks (GET/POST)
/api/projects/[id]/tasks/[taskId] (PATCH/DELETE)
/api/projects/[id]/tasks/[taskId]/comments (GET/POST)
/api/projects/[id]/tasks/[taskId]/comments/[commentId] (DELETE)
/api/projects/[id]/tasks/[taskId]/assignees/[userId] (PUT/DELETE)
/api/projects/[id]/tasks/reorder (POST)
/api/projects/[id]/tasks/import (POST)
/api/projects/[id]/tasks/export (GET — CSV)
/api/projects/[id]/dependencies (GET/POST/DELETE)
/api/projects/[id]/github/pull (POST)
/api/projects/[id]/github/push (POST)
```
