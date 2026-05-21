# 本番運用チェックリスト

ganto を本番環境（Vercel + Neon + Sentry）で安全に運用するための手順集。
パスワードリセットメールは Neon Auth (Better Auth) の OTP 配信を利用するため、
本リリースでは Resend など外部メールプロバイダの設定は不要。
（詳細は `docs/EMAIL.md`）

## 初回デプロイ前

### 1. 環境変数の整合確認
- [ ] `DATABASE_URL` が本番 Neon の Pooled URL
- [ ] `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` 設定済み
- [ ] `AUTH_SECRET` が本番用 (`openssl rand -hex 32`)
- [ ] `APP_URL` が本番ドメイン
- [ ] `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` 設定済み
- [ ] Neon Auth Console で **GitHub provider が有効化**されている（GitHub Projects 同期を使う場合のみ。`docs/GITHUB-OAUTH.md` 参照）

### 2. Neon Auth 設定
- [ ] Allowed Origins に本番 URL を追加
- [ ] Preview URL も追加（`https://*.vercel.app` か個別）
- [ ] 必要な OAuth プロバイダ（Google 等）が enabled
- [ ] Email テンプレート / 送信元アドレスが Neon Console で確認できる

### 3. データベース
- [ ] 本番 DB に `pnpm db:migrate` 実行済み
- [ ] `pnpm db:seed` でビルトインロール投入済み
- [ ] Neon の Point-in-Time Restore が有効
- [ ] **Neon PITR で 30 分前にリストアできることを試したことがある**

### 4. Sentry 動作確認
- [ ] preview デプロイで意図的にエラーを発生させ Sentry に届くことを確認
- [ ] PII scrub が動いている（メアド / Cookie / Authorization が含まれない）
- [ ] Source maps が upload されている（stack trace が読める）
- [ ] アラートルールが設定されている（`docs/SENTRY.md` 参照）

### 5. メール到達確認 (Neon Auth 経由)
- [ ] preview 環境で `/forgot-password` から実メアドに OTP メール送信 → 受信確認
- [ ] 受信メールがスパム判定されないこと（迷惑メールフォルダもチェック）
- [ ] OTP コードで `/reset-password` を完了できる
- [ ] 存在しない / typo メアドでも応答画面が同じ（user enumeration 漏洩がない）

## 毎リリース前

- [ ] `pnpm lint` 通過
- [ ] `pnpm build` 通過
- [ ] 影響のある機能の手動検証
- [ ] スキーマ変更がある場合は migration を本番 DB に適用
- [ ] Vercel deploy 後 Sentry の release tag が作成されているか確認
- [ ] PR テンプレのチェックリストが埋まっている

## 緊急対応

### Project の削除 / 復元

プロジェクト削除は **soft delete**（env フラグ不要）:

1. Settings → Danger zone でプロジェクト名を入力して削除 → Trash 入り（一覧から消える）
2. 復元はホーム画面の「削除済みプロジェクト」セクションから
3. 監査ログに `project.delete` / `project.restore` が記録される

物理削除（hard delete）が本当に必要な場合のみ、DBA が Neon コンソールで該当行を直接削除（cascade で関連データも消える、不可逆）。

### データ復旧

#### タスクの誤削除（soft delete）
- ガントの 🗑 Trash から Restore ボタン
- 30 日以内なら可能（cron は v2 で追加）

#### タスク以外の誤削除 / DB 破損
1. Sentry / ログで影響範囲確認
2. Neon Console → Branches → Restore from point in time
3. リストア先を別ブランチとして作成 → 差分確認 → 必要なレコードを手動コピー

### 障害時の確認手順

1. **Sentry ダッシュボード**: 5 分以内に何個エラーが上がっているか
2. **Vercel logs**: API のエラーログ
3. **Neon Console**: DB の latency / connection pool
4. **Neon Auth ログ**: パスワードリセット / サインイン関連のエラー

## 月次メンテナンス

- [ ] Sentry: 既知の noise を resolve / ignore
- [ ] Neon: storage size / branch 数の確認
- [ ] Neon Auth: ログインエラー率 / OTP メール失敗率
- [ ] 依存関係: `pnpm outdated`
- [ ] 監査ログのバックアップ（audit_log テーブルの SQL dump）

## 連絡先 / オーナーシップ

| ロール | 担当 |
|---|---|
| 障害一次対応 | TBD |
| Sentry alert 受信 | TBD |
| データ復旧オペレーター | TBD |
| Vercel / Neon 環境変数管理 | TBD |
