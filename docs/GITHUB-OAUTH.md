# GitHub OAuth セットアップ

ganto は GitHub Projects v2 同期のために、**各ユーザーが自分の GitHub アカウントを接続する** OAuth 方式を採用しています。
（以前の単一 `GITHUB_PAT` 共有方式は v3 で廃止。複数ユーザーの権限が漏れ合うリスクと、他人の Project が同期できない制限があったため）

## 全体像

```
ユーザー A ─── /account の Connect GitHub ───► GitHub OAuth ───► Neon Auth に access_token 保存
                                                                            │
                                                                            ▼
Project Settings → Pull / Push ──────────────► ganto API ─────► A の token で GitHub API
                                                                            │
                                                                            ▼
                                                       ユーザー A がアクセスできる Project のみ
```

## 一度だけ必要な準備

### 1. GitHub OAuth App を作成

1. https://github.com/settings/applications/new
2. 入力:
   - **Application name**: `ganto`（任意）
   - **Homepage URL**: `https://ganto-seven.vercel.app`（本番 URL）
   - **Authorization callback URL**: Neon Auth が提示するコールバック URL
     - 通常 `<NEON_AUTH_BASE_URL>/oauth/callback/github` の形
     - 正確な URL は Neon Auth Console の **Providers → GitHub** ページに表示される
3. **Register application**
4. 表示された **Client ID** をコピー
5. **Generate a new client secret** → secret をコピー（一度しか表示されない）

### 2. Neon Auth Console で GitHub provider を有効化

1. Neon Console → 該当プロジェクト → **Auth** → **Providers / Configuration**
2. GitHub provider を **Enable**
3. Client ID と Client Secret を入力
4. Scopes（要求する権限）:
   - `read:project` — GitHub Projects v2 の読み取り
   - `project` — Projects v2 の書き込み（push に必要）
5. **Save**

### 3. （任意）Preview / Local の URL もコールバック登録

OAuth App の Authorization callback URL は **1 つしか登録できません** が、Neon Auth は通常その 1 つで Production / Preview / Local 全てを処理します（Neon Auth がプロキシ）。
Preview ごとに別の OAuth App を作る必要はありません。

## 動作確認

1. デプロイ後、ユーザーがログイン
2. 右上のメアド or 名前をクリック → `/account` ページへ
3. **GitHub セクション** → **Connect GitHub** をクリック
4. GitHub の認可画面へリダイレクト → Authorize
5. ganto に戻る → 「Connected」が表示される

接続したら:
- プロジェクトの Settings → Storage mode を `GitHub Projects v2` に変更
- Owner と Project number を入力
- **Pull from GitHub** / **Push to GitHub** ボタンが利用可能になる

## 接続を解除

`/account` → GitHub セクション → **Disconnect**。
解除後は同期 API が `412 GITHUB_NOT_CONNECTED` を返し、UI が「Connect GitHub first」を促します。

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| Connect ボタンを押しても何も起きない | Neon Auth 側で GitHub provider が enable になってない |
| GitHub の認可画面で「Application not found」 | OAuth App の Client ID が Neon Auth の設定と不一致 |
| Authorize 後 redirect_uri error | OAuth App の callback URL と Neon Auth のコールバック URL が不一致 |
| Pull/Push で 412 GITHUB_NOT_CONNECTED | ユーザーがまだ Connect していない |
| Pull/Push で 400 「Could not load GitHub project」 | 接続済みアカウントが当該 Project にアクセス権を持っていない、または Owner/Number が間違い |
| 「Status field not found」 warning | GitHub Project v2 に Status / Start / End フィールドが無い。GitHub Project の `+ Add field` から作成 |

## セキュリティ

- access_token は **Neon Auth が保管**（DB の `neon_auth.account` テーブル）
- アプリ側コードは読み取るだけで生 token を扱わない
- ユーザーが Disconnect すれば即座に同期不可になる
- 監査ログに `github.sync.pull` / `github.sync.push` が記録される（誰がいつ実行したか追跡可能）
