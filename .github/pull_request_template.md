## 概要

<!-- 何を変更したか、なぜ変更したか -->

## 種類

- [ ] 新機能
- [ ] バグ修正
- [ ] リファクタ
- [ ] ドキュメント
- [ ] 運用 / インフラ

## チェックリスト

### コード品質

- [ ] `pnpm lint` が通る
- [ ] `pnpm build` が通る
- [ ] 既存の機能をリグレッションさせていない

### API (新規 / 既存変更時)

- [ ] 新規 API ルートには `requireCurrentUser()` + `requireCapability()` を追加した
- [ ] 既存の mutation には `recordAudit()` を追加した（または既存ロジックを維持した）
- [ ] PATCH 系は楽観ロック（`lockVersion`）を尊重する。`expectedLockVersion` 未指定は 400 を返す
- [ ] `docs/security-audit.md` の表に行を追加 / 更新した

### データ削除 (重要)

- [ ] **tasks の削除は soft delete 必須**（hard delete は `task_dependencies` / `comments` のみ許可）
- [ ] **project / task の削除は soft delete**（Trash から復元可能）。hard delete は `task_dependencies` / `comments` のみ許可
- [ ] tasks の SELECT には `isNull(tasks.deletedAt)` を追加した（Trash 専用ビューを除く）

### スキーマ変更

- [ ] migration ファイルを生成・コミットした (`pnpm db:generate` 実行済み)
- [ ] Migration の rollback 方針が PR 説明に記載されている
- [ ] 既存データへの影響を検証した

### 機密情報

- [ ] `.env*` をコミットしていない
- [ ] API キー / トークンをコードにベタ書きしていない

## 手動検証シナリオ

<!-- 動作確認した手順を具体的に -->

1.
2.
3.

## 関連

<!-- Linear / 関連 PR / issue 等があれば -->
