# Security Audit: API Routes

最終監査: 2026-05-13

このドキュメントは ganto の全 API ルートが「認証 + 認可」を正しく実装していることを保証する。
新規ルート追加時は **PR テンプレートのチェックリスト**を通じて本書の更新を必須とする。

## 認証 / 認可 ヘルパー

| ヘルパー | 役割 | 定義場所 |
|---|---|---|
| `requireCurrentUser()` | セッション Cookie からユーザーを取得。未認証なら 401。 | `lib/auth/session.ts` |
| `getMembership(projectId, userId)` | プロジェクトの membership を取得。`null` なら未参加。 | `lib/projects/membership.ts` |
| `requireCapability(memberships.roleId, capability, scope?)` | ロールが capability を持つか検証。なければ 403。 | `lib/auth/permission.ts` |
| `recordAudit(entry)` | 監査ログを書き込む | `lib/audit/log.ts` |

**全ての mutation 系ルートは 必ず `requireCurrentUser()` + `requireCapability()` を通すこと。**

## ルート一覧（2026-05-13 時点）

### Projects

| ルート | メソッド | 認証 | 認可 capability | 監査 |
|---|---|---|---|---|
| `/api/projects` | GET | ✓ | (自分の参加プロジェクト一覧) | — |
| `/api/projects` | POST | ✓ | (自由 — オーナーになる) | `project.create` |
| `/api/projects/[id]` | GET | ✓ | `getMembership` 必須 | — |
| `/api/projects/[id]` | PATCH | ✓ | `project.settings` | `project.update` |
| `/api/projects/[id]` | DELETE | ✓ | `project.delete` + `ALLOW_PROJECT_DELETE=true` | `project.delete` / `project.delete.blocked` |

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

### Dependencies

| ルート | メソッド | 認証 | 認可 | 監査 |
|---|---|---|---|---|
| `/api/projects/[id]/dependencies` | GET | ✓ | `getMembership` | — |
| `/api/projects/[id]/dependencies` | POST | ✓ | `task.update` | `task.dependency.add` |
| `/api/projects/[id]/dependencies` | DELETE | ✓ | `task.update` | `task.dependency.remove` |

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

- 全 mutation ルートで `requireCurrentUser` + `requireCapability` が実装されている
- 唯一の公開エンドポイント `/api/invitations/[token]` GET は意図的（招待表示用）。POST 側で token 検証
- `/api/projects/[id]` DELETE は `ALLOW_PROJECT_DELETE` env で gate 済み（v2 まで実質無効）

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
- レートリミット: `/api/auth/login`, `/api/auth/forget-password` などのブルートフォース対策
