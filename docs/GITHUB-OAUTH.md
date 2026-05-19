# GitHub OAuth セットアップ

ganto は GitHub Projects v2 同期のために、**ganto 内で完結する独自 OAuth フロー** を実装しています。Neon Auth の social provider は使いません。

## なぜ独自 OAuth?

最初は Neon Auth (Better Auth) の `linkSocial` 経由で GitHub と連携しようとしましたが、Neon Auth の proxy + 自前 OAuth キーの組み合わせで **state cookie が cross-domain で消える** 問題に当たりました:

```
ブラウザ → ganto.vercel.app /api/auth (proxy)  → Neon backend が state cookie 発行
state cookie は ganto.vercel.app ドメインに保存
↓
GitHub Authorize → ep-...neon.tech に戻る (redirect_uri が Neon backend に固定)
↓
Neon backend は自分のドメインで state cookie を探すが、cookie は ganto にしかない
→ state_mismatch エラー
```

Neon の "Shared keys" モードでは内部回避策があって動きますが、自前キーを入れた瞬間にこの抜け道は使えなくなります。

→ **ganto 内で完結する OAuth flow を実装**。すべて単一ドメイン (ganto.vercel.app) で動くので cookie 問題は発生しません。

## 全体像

```
ユーザー A
  ↓ /account の Connect GitHub をクリック
  ↓
[GET] /api/github/oauth/init           ← ganto
  state cookie を ganto.vercel.app ドメインに発行
  ↓ 302 → GitHub authorize
  ↓
GitHub OAuth 認可画面
  ↓ Authorize
  ↓
[GET] /api/github/oauth/callback?code=...&state=... ← ganto
  state cookie 検証 (同じドメインなので確実に届く)
  ↓
  access_token を GitHub の token endpoint から取得
  ↓
  github_user_tokens テーブルに保存
  ↓ 302 → /account?gh=connected
  ↓
完了
```

## 一度だけ必要な準備

### 1. GitHub OAuth App を作成

1. https://github.com/settings/applications/new
2. 入力:
   | 項目 | 値 |
   |---|---|
   | Application name | `ganto`（任意） |
   | Homepage URL | `https://ganto-seven.vercel.app` |
   | **Authorization callback URL** | `https://ganto-seven.vercel.app/api/github/oauth/callback` |
3. **Register application**
4. **Client ID** をコピー
5. **Generate a new client secret** → secret をコピー（一度しか表示されない）

ローカル開発もしたい場合は同じ App で OK ですが、callback URL は 1 つしか登録できないので、開発時は本番 URL を使うか、別途 dev 用の OAuth App を作る形になります（推奨: dev 用に別 App）。

### 2. Vercel 環境変数を追加

| 変数 | 値 |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Step 1.4 でコピーした Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | Step 1.5 でコピーした Client Secret |

Vercel → Settings → Environment Variables で追加 → **Production と Preview 両方** にチェック。

すでに設定済みの `APP_URL` が `https://ganto-seven.vercel.app` を指していることも確認。OAuth flow の redirect_uri はここから組み立てます。

### 3. Redeploy

env 追加後は再デプロイが必要（自動的に走るはず、走らなければ手動 redeploy）。

## 動作確認

1. デプロイ後、ユーザーとして ganto にログイン
2. 右上のメアド or 名前をクリック → `/account` ページへ
3. **GitHub セクション** → **Connect GitHub** をクリック
4. GitHub の認可画面で以下の権限が要求される:
   - Read access to projects
   - Full control of projects
   - Read access to email addresses
5. **Authorize**
6. ganto に戻ってきて「Connected as @<your-github-username>」が表示される

その後:
- プロジェクトの Settings → Storage mode を `GitHub Projects v2` に
- Owner と Project number を入力
- **Pull from GitHub** / **Push to GitHub** ボタンが利用可能

## 接続を解除

`/account` → GitHub セクション → **Disconnect**。
DB の `github_user_tokens` 行が削除され、以降の同期 API は `412 GITHUB_NOT_CONNECTED` を返します。

GitHub 側でアプリ自体を revoke したい場合は https://github.com/settings/applications から手動で remove access。

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| Connect ボタンを押しても何も起きない | サーバー側ログを確認。`GITHUB_OAUTH_CLIENT_ID` 未設定が典型 |
| `redirect_uri_mismatch` エラー | OAuth App の Authorization callback URL が `https://ganto-seven.vercel.app/api/github/oauth/callback` 完全一致になっているか確認 |
| `?gh_error=state_mismatch` | ブラウザが cookie をブロックしている / 10 分以上経過 / 別タブで進行中。シークレットウィンドウで再試行 |
| `?gh_error=exchange_failed` | GitHub 側で client_secret が不一致 or 期限切れ。secret を再生成 → Vercel env 更新 |
| Pull/Push で 412 GITHUB_NOT_CONNECTED | `/account` で Connect を先に |
| 「Could not load GitHub project」 | 接続済みアカウントが当該 Project にアクセス権なし、または Owner/Number 間違い |

## セキュリティノート

- `access_token` は `github_user_tokens` テーブルに **plain text 保存**
  - Neon の DB は AWS の at-rest 暗号化が効いている
  - アプリレイヤで user_id による row-locking
  - application-level 暗号化は将来の課題
- `state` cookie は `HttpOnly` + `SameSite=Lax` + production では `Secure`
- 監査ログ: `github.connect` / `github.disconnect` を記録（誰がいつ操作したか追跡可能）

## DB スキーマ

```sql
github_user_tokens (
  id                uuid PRIMARY KEY
  user_id           text NOT NULL UNIQUE  -- Neon Auth user id
  github_user_id    text NOT NULL         -- GitHub numeric id
  github_login      text NOT NULL         -- GitHub username
  access_token      text NOT NULL
  refresh_token     text                  -- 通常 GitHub OAuth では NULL
  scope             text                  -- granted scopes
  expires_at        timestamptz           -- NULL なら無期限
  created_at        timestamptz NOT NULL
  updated_at        timestamptz NOT NULL
)
```

一人一行。re-link 時は DELETE + INSERT で上書き（access_token を確実に更新）。
