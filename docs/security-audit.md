# Security Audit: API Routes

最終監査: 2026-05-21（Phase 8 機能拡充を反映）

このドキュメントは ganto の全 API ルートが「認証 + 認可」を正しく実装していることを保証する。
新規ルート追加時は **PR テンプレートのチェックリスト**を通じて本書の更新を必須とする。

## 認証 / 認可 ヘルパー

| ヘルパー | 役割 | 定義場所 |
|---|---|---|
| `requireCurrentUser()` | セッション Cookie からユーザーを取得。未認証なら 401。 | `lib/auth/server.ts` |
| `getMembership(userId, projectId)` | プロジェクトの membership を取得。`null` なら未参加。 | `lib/projects/members.ts` |
| `hasCapability(userId, projectId, capability)` | ロールが capability を持つか検証（all scope）。 | `lib/auth/permission.ts` |
| `hasCapabilityFor(userId, projectId, capability, isOwner)` | own/all scope を考慮した capability 検証（自分のリソースなら own で許可）。 | `lib/auth/permission.ts` |
| `recordAudit(entry)` | 監査ログを書き込む（多くは lib 層で記録） | `lib/audit/log.ts` |

**全ての mutation 系ルートは 必ず `requireCurrentUser()` + capability 検証を通すこと。**
監査は route ではなく **lib 関数内**で記録するものが多い（例: `lib/projects/share.ts` が `share.create` / `share.revoke`）。

## ルート一覧（2026-05-21 時点）

### Projects

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects` | GET | ✓ | (自分の参加プロジェクト一覧) | — |
| `/api/projects` | POST | ✓ | (自由 — オーナーになる) | `project.create` |
| `/api/projects/[id]` | GET | ✓ | `getMembership` 必須 | — |
| `/api/projects/[id]` | PATCH | ✓ | `project.settings` | `project.update` |
| `/api/projects/[id]` | DELETE | ✓ | `project.delete` | `project.delete` (soft delete) |
| `/api/projects/[id]/restore` | POST | ✓ | `project.delete` | `project.restore` |

### Tasks

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/tasks` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/tasks` | POST | ✓ | `task.create` | `task.create` |
| `/api/projects/[id]/tasks/[taskId]` | PATCH | ✓ | `task.update`（own scope 対応） | `task.update.*` |
| `/api/projects/[id]/tasks/[taskId]` | DELETE | ✓ | `task.delete`（own scope 対応） | `task.delete` |
| `/api/projects/[id]/tasks/[taskId]/restore` | POST | ✓ | `task.delete.any` または自分が削除した場合 | `task.restore` |
| `/api/projects/[id]/tasks/reorder` | POST | ✓ | `task.update`（all scope） | `task.reorder` |
| `/api/projects/[id]/tasks/import` | POST | ✓ | `task.create` | `task.import` |
| `/api/projects/[id]/tasks/export` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/trash` | GET | ✓ | `task.delete.any` / `task.delete.own` | — |

### Task sub-resources

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/tasks/[taskId]/comments` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/tasks/[taskId]/comments` | POST | ✓ | `getMembership` | `comment.create` |
| `/api/projects/[id]/tasks/[taskId]/comments/[commentId]` | DELETE | ✓ | 作者 or `task.update` | `comment.delete` |
| `/api/projects/[id]/tasks/[taskId]/assignees/[userId]` | PUT | ✓ | `task.update`（own scope 対応） | `task.assignee.add` |
| `/api/projects/[id]/tasks/[taskId]/assignees/[userId]` | DELETE | ✓ | `task.update`（own scope 対応） | `task.assignee.remove` |
| `/api/projects/[id]/tasks/[taskId]/attachments` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/tasks/[taskId]/attachments` | POST | ✓ | `hasCapabilityFor task.update`（own scope 対応） | `attachment.add` |
| `/api/projects/[id]/tasks/[taskId]/attachments/[attachmentId]` | DELETE | ✓ | `hasCapabilityFor task.update`（own scope 対応・taskId スコープで他タスク添付削除を防止） | `attachment.remove` |
| `/api/projects/[id]/tasks/[taskId]/audit` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/tasks/[taskId]/cascade-shift` | POST | ✓ | `task.update` | `task.cascade_shift` |
| `/api/projects/[id]/tasks/[taskId]/repeat` | POST | ✓ | `task.create` | `task.repeat` |

### Dependencies

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/dependencies` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/dependencies` | POST | ✓ | `task.update` | `task.dependency.add` |
| `/api/projects/[id]/dependencies` | DELETE | ✓ | `task.update` | `task.dependency.remove` |

### PM 可視化（Milestones / Baselines）

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/milestones` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/milestones` | POST | ✓ | `task.create` | `milestone.create` |
| `/api/projects/[id]/milestones/[milestoneId]` | PATCH | ✓ | `task.create` | `milestone.update` |
| `/api/projects/[id]/milestones/[milestoneId]` | DELETE | ✓ | `task.create` | `milestone.delete` |
| `/api/projects/[id]/baselines` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/baselines` | POST | ✓ | `task.create` | `baseline.create` |
| `/api/projects/[id]/baselines/[baselineId]` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/baselines/[baselineId]` | DELETE | ✓ | `task.create` | `baseline.delete` |

### Templates

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/templates` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/templates` | POST | ✓ | `task.create` | `template.create` |
| `/api/projects/[id]/templates/[templateId]` | POST（適用） | ✓ | `task.create` | `template.apply` |
| `/api/projects/[id]/templates/[templateId]` | DELETE | ✓ | `task.create` | `template.delete` |

### Share（公開読み取り専用リンク）

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/share` | GET | ✓ | `project.settings`（トークン抽出による再配布を防止） | — |
| `/api/projects/[id]/share` | POST | ✓ | `project.settings`（audience 拡大のため） | `share.create` |
| `/api/projects/[id]/share/[tokenId]` | DELETE | ✓ | `project.settings` | `share.revoke` |
| `/share/[token]`（ページ） | GET | ✗ | (公開) | 意図的に公開。token で解決、`all` visibility タスクのみ、soft-deleted プロジェクトは `notFound` |

### Notifications

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/notifications` | GET | ✓ | (本人のみ — userId スコープ) | — |
| `/api/notifications/read` | POST | ✓ | (本人のみ — userId スコープ) | — |

### Account & GitHub OAuth（self-hosted）

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/account/github/status` | GET | ✓ | (本人のみ) | — |
| `/api/account/sessions` | GET | ✓ | (本人のみ — `auth.listSessions()`) | — |
| `/api/account/sessions/revoke` | POST | ✓ | (本人のみ — `auth.revokeSession()`) | — |
| `/api/github/oauth/init` | GET | ✓ | (本人のみ — CSRF state Cookie 発行) | — |
| `/api/github/oauth/callback` | GET | ✓ | (本人のみ — CSRF state 検証) | `github.connect` |
| `/api/github/oauth/disconnect` | POST | ✓ | (本人のみ) | `github.disconnect` |

### Members & Roles

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/members` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/members/[userId]` | PATCH | ✓ | `member.role.change` | `member.role.change` |
| `/api/projects/[id]/members/[userId]` | DELETE | ✓ | `member.remove`（自己離脱は除く） | `member.remove` |
| `/api/projects/[id]/roles` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/roles` | POST | ✓ | `role.create` | `role.create` |
| `/api/projects/[id]/roles/[roleId]` | PATCH | ✓ | `role.update` | `role.update` |
| `/api/projects/[id]/roles/[roleId]` | DELETE | ✓ | `role.delete` | `role.delete` |

### Invitations

| ルート | メソッド | 認証 | 認可 | 備考 |
|---|---|---|---|---|
| `/api/projects/[id]/invitations` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/invitations` | POST | ✓ | `member.invite` | `invitation.create` |
| `/api/invitations/[token]` | GET | ✗ | (公開) | UX 上意図的に公開。token 有効期限は POST で検証 |
| `/api/invitations/[token]` | POST | ✓ | (token 自体が認可) | `invitation.accept` |

### GitHub Sync

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/github/pull` | POST | ✓ | `project.settings` | `github.pull` |
| `/api/projects/[id]/github/push` | POST | ✓ | `project.settings` | `github.push` |

### Auth

| ルート | メソッド | 認証 | 認可 | 備考 |
|---|---|---|---|---|
| `/api/auth/[...path]` | ALL | (SDK 内) | (Neon Auth / Better Auth が管理) | session / signup / signin / password reset 全て |

## 監査結果サマリ

- 全 mutation ルートで `requireCurrentUser` + capability 検証（`hasCapability` / `hasCapabilityFor`）が実装されている
- 公開エンドポイントは 2 つのみ、いずれも意図的:
  - `/api/invitations/[token]` GET（招待表示用。POST 側で token 検証）
  - `/share/[token]` ページ GET（公開リンク。token で解決、`all` visibility タスクのみ、soft-deleted プロジェクトは弾く）
- `/api/projects/[id]` DELETE は soft delete（Trash 経由で復元可能。env フラグ不要）
- `share` トークンの一覧 / 作成 / 取消はいずれも `project.settings`（audience 拡大ガード）
- attachment の削除は `taskId` スコープで他タスクの添付を消せないことを保証
- 通知 / アカウント / GitHub OAuth ルートは本人スコープのみ（`userId` で絞り込み）
- soft-deleted（Trash 入り）プロジェクトは全サブページ（Gantt / report / resources / audit / members / roles / settings / trash）と My tasks 横断ビューで `projects.deletedAt IS NULL` ゲートにより不可視（復元はホームの「削除済みプロジェクト」からのみ）

## チェックリスト（新規ルート追加時）

PR テンプレ（`.github/pull_request_template.md`）にも反映済み:

- [ ] `requireCurrentUser()` を呼んでいる
- [ ] `getMembership()` でプロジェクトメンバーか検証している
- [ ] `requireCapability()` で適切な capability を要求している
- [ ] mutation には `recordAudit()` を追加した
- [ ] PATCH は `expectedLockVersion` を Zod で検証し未指定なら 400 を返す
- [ ] tasks の SELECT は `isNull(tasks.deletedAt)` を含む（Trash 専用を除く）
- [ ] 本ドキュメントの表に行を追加した

## 将来の課題

- 自動テスト（e2e で 401 / 403 / 200 を確認）
- ロギング: 認可拒否時に Sentry へ送るか検討（今は黙って 403）
- ~~レートリミット: 認証系のブルートフォース対策~~ → **実装済み**（`proxy.ts` + `lib/rate-limit.ts`、auth POST に 10/5min per IP+path、in-memory fixed-window / fail-open）。強い保証が必要なら共有ストア（Upstash / Vercel KV）へ差し替え
- `/api/account/sessions/revoke` / `/api/notifications/read` は監査ログ未記録（本人操作・低リスクのため現状は意図的）
