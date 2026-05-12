# メール配信ガイド

## 現状: Neon Auth 内蔵メール (Resend なし)

ganto のパスワードリセットは **Neon Auth (Better Auth) の OTP メール配信**を利用している。Neon Auth がベータの間はリンクベース (token URL) ではなく、6 桁の OTP コードをメール送信する方式しかサポートされていない。

メール送信元 / 配信は Neon の hosted auth サービス（`NEON_AUTH_BASE_URL`）が裏で処理する。**フロントエンドやサーバーから直接 Resend を呼んではいない**。
そのため、本リリースでは `RESEND_API_KEY` / `EMAIL_FROM` の設定は不要（`DEPLOY.md` の必須 env からも除外済み）。

`resend` パッケージ自体は `package.json` に残しているが、これは将来の通知機能（メンション通知、リマインダ等）への移行を見越した pre-install。アクティブには使われていない。

## 実装フロー

1. `/forgot-password` で email を入力
   → `authClient.forgetPassword.emailOtp({ email })` を叩く
   → Neon Auth が OTP を生成し、登録ユーザーにメール送信
2. `/reset-password?email=...` で email + OTP + 新パスワードを入力
   → `authClient.emailOtp.resetPassword({ email, otp, password })`
   → 成功なら `/login` にリダイレクト

## ユーザー列挙対策

- `/forgot-password` の応答は **存在の有無に関わらず常に同じ文言**:
  > "該当するアカウントがある場合、リセット用の 6 桁コードをメールでお送りしました"
- API のレスポンスは UI に表示しない（エラーも黙る）
- メール送信失敗は `instrumentation.ts` の `onRequestError` から Sentry に流れる

## 到達性チェック（本番デプロイ前）

1. preview 環境で `/forgot-password` から実メアドを入力
2. メール受信確認（必ず迷惑メールフォルダもチェック）
3. 6 桁コードで `/reset-password` を完了できることを確認
4. 数アカウントで連続実行してレート制限に当たらないか
5. 存在しないメアドで送信しても同じ画面が出ることを確認

## 監視

| 観点 | 確認場所 |
|---|---|
| 失敗率 | Sentry の `onRequestError` イベント、特に `/api/auth/forget-password/email-otp` の 4xx/5xx |
| アラート | Sentry alert ルールで `password_reset_email_failed` 文字列を含むイベントを通知 (`docs/SENTRY.md` 参照) |

## 将来 (Resend への切り替え時)

リンクベースのリセット / 通知メール / メンション通知などで独自送信が必要になったら:

1. `resend` パッケージは既にインストール済み (`package.json` 参照)
2. `lib/email/send.ts` を新規作成（薄いラッパー）
3. Resend ダッシュボードで送信元ドメインの **SPF + DKIM + DMARC** 認証を完了
4. `EMAIL_FROM` を認証済みドメインのアドレスに設定
5. `RESEND_API_KEY` を `.env.local` および Vercel に追加

### Resend ドメイン認証手順（参考）

1. Resend Console → Domains → Add Domain
2. 表示される DNS レコード（SPF / DKIM / DMARC）をドメイン管理画面に追加
3. Verify を押す（数分〜数時間で propagate）
4. 認証完了後の送信成功率を Resend ダッシュボードでモニタ

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| メールが届かない | Neon Auth の email 設定が未構成。Neon ダッシュボード → Auth → Email でテンプレートと送信元を確認 |
| 「コードが無効」と出る | OTP の有効期限（標準 5〜15 分）切れ。`/forgot-password` からやり直す |
| 大量送信で 429 | Neon Auth のレート制限。本格運用なら Resend 切替検討 |
| spam フォルダに入る | Neon Auth の送信元ドメインが原因。Resend で独自ドメイン認証する方が安定 |
