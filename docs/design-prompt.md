# gantto デザインプロンプト

v0 / Figma AI / Claude などのデザイン生成 AI に投げるためのプロンプト。
下の `## 投入用プロンプト（ここから下をコピー）` 以下をそのままコピーして使う。

---

## 投入用プロンプト（ここから下をコピー）

GitHub Projects v2 をデータソースにしたガントチャート Web アプリ「gantto」のデザインを作って。
ハッカソン用のチーム共有ツールで、共有パスワード認証で全画面ガード済み。
**デザインの目的は「既存のテーマ変数とコンポーネントの上に、密度の高い情報設計を載せる」こと。** 既存の色やコンポーネント名を変えないでほしい。

---

### 技術前提（変えない）

- Next.js 16 App Router + React 19 (Server / Client Components 両方使用可)
- Tailwind CSS v4 + shadcn/ui (style: `radix-nova`, baseColor: `neutral`)
- アイコン: `lucide-react`
- フォント: Geist Sans (本文) / Geist Mono (数値・ラベル)
- 既存の CSS 変数（OKLCH、ライト/ダーク両対応）:
  - `--background` `--foreground`
  - `--card` `--card-foreground`
  - `--primary` `--primary-foreground`
  - `--secondary` `--secondary-foreground`
  - `--muted` `--muted-foreground`
  - `--accent` `--accent-foreground`
  - `--destructive`
  - `--border` `--input` `--ring`
  - `--chart-1` 〜 `--chart-5`（グレースケール）
  - `--sidebar` 系統一式
  - `--radius`（=0.625rem、`rounded-md` で十分）

色は `text-foreground` `bg-background` `border-border` のように Tailwind v4 で参照する。`#hex` や `oklch(...)` を直接書かない。

---

### デザイン原則

1. **Linear / Height / GitHub Projects 系**の「静かで密度の高い」情報設計。装飾を削ぎ、データに集中させる
2. **角丸控えめ（`rounded-md` 程度）、シャドウ最小限**。border でレイヤを分ける
3. **カラー: neutral グレースケール基調 + アクセント1色**（`--primary`）。複数色を使うのは status バッジだけ
4. **タイポグラフィ**: 見出しは Geist Sans semibold、数値・日付は Geist Mono、本文は Sans regular
5. **日本語と英語が混在**しても破綻しない（行の高さ、約物の余白）
6. **ライト・ダークモード両対応**。テーマトグルは作らず、OS 設定追従のみ
7. PC（1280px+）優先、タブレット最低限。スマホは対応しない

---

### 画面1: メインのガントチャート画面 (`/`)

#### グローバルヘッダー（高さ 48px、下に `border-b border-border`）

左から:
- ロゴ「gantto」（小文字、`font-semibold tracking-tight`、Geist Mono の風味）
- 縦区切り線
- ズームコントロール（Day / Week / Month のセグメントボタン、shadcn `ToggleGroup` か `Tabs` ベース）
- 「Today」ボタン（`lucide-react` の `CalendarDays` アイコン、押すと今日の縦線にスクロール）

右から:
- 「+ New task」ボタン（`variant="default"`、`Plus` アイコン）
- 区切り
- アバター + ドロップダウン（中身は「Sign out」のみ）

#### 本体: 2ペーン構成

横分割で:

**左ペーン (320px 固定): タスクリスト**
- 最上部に細いツールバー（高さ 32px）: 「Tasks (12)」+ 並び替えアイコン（`ArrowUpDown`）+ フィルタアイコン（`SlidersHorizontal`）
- 各行（高さ 36px、下に `border-b border-border`）:
  - タイトル（1行省略、`text-sm`）
  - 右側に status バッジ（後述）
  - その右にアサイニーのアバター（重なり表示、最大3人 + 「+N」）
- 行 hover: `bg-muted`
- 選択行: `bg-accent` + 左に 2px の `bg-primary` インジケータ

**右ペーン (flex-1、横スクロール): タイムライン**

- 上部に2段の日付ヘッダー（合計高さ 48px、下に `border-b border-border`）:
  - 上段: 月名（`text-xs text-muted-foreground`）
  - 下段: 日付（`text-xs font-mono`、当日のみ `bg-primary text-primary-foreground` の丸い pill）
  - 週末（土日）の列は背景に `bg-muted/40`
- ヘッダー直下からタイムライン本体:
  - 日付目盛りの縦罫線（薄い `border-border/50`）
  - タスクごとに 36px 行（左ペーンの行と同期）
  - バー: `position: absolute`、X = 開始日からの px、幅 = 期間日数 × dayWidth
    - 高さ 28px、行内で縦中央
    - `rounded-md`、status による塗り分け（後述）
    - 内部: タイトル省略 + 必要なら右端に進捗 dot
    - 両端 6px 幅にリサイズハンドル（`cursor-ew-resize`、hover で `bg-foreground/20`）
    - バー全体は `cursor-grab`、ドラッグ中 `cursor-grabbing`
  - 「Today」縦線: `bg-destructive`、上端に「Today」ピル（`bg-destructive text-destructive-foreground`）

#### Status バッジの設計

| Status | バッジ色 | バー塗り |
|---|---|---|
| Todo | `bg-muted text-muted-foreground border` | `bg-card border-2 border-border` の枠線スタイル |
| In Progress | `bg-primary/10 text-primary border-primary/30` | `bg-primary text-primary-foreground` |
| Done | `bg-secondary text-secondary-foreground` + 取り消し線 | `bg-muted text-muted-foreground` + 内側に取り消し線 |
| Backlog（任意） | `bg-card text-muted-foreground border-dashed` | `bg-card border border-dashed` |

ユーザーの実プロジェクトに合わせた status を後で追加しやすいよう、上記4種類を例示する。

#### バーのインタラクション状態

5状態すべて視覚的に区別できるように:
- 通常
- hover（`ring-2 ring-ring/40`）
- dragging（他のバーが `opacity-50`、自分は `shadow-lg`）
- resizing（リサイズハンドルが太く強調）
- selected（`ring-2 ring-ring`）

---

### 画面2: 空状態（タスク0件のとき）

右ペーン中央に縦並びで:
- アイコン `lucide-react CalendarRange` 48px、`text-muted-foreground`
- 見出し「No tasks yet」(`text-lg font-semibold`)
- 説明「Create your first task to start planning.」(`text-sm text-muted-foreground`)
- 「+ New task」ボタン（`variant="default"`）

---

### 画面3: New task ダイアログ（shadcn `Dialog`）

- タイトル: 「New task」(`text-lg font-semibold`)
- 説明: なし
- フィールド（縦並び、間隔 `space-y-4`）:
  1. **Title** (`Input`、必須、autoFocus)
  2. **Status** (`Select`、上記の status から選択、デフォルト Todo)
  3. **Start date / End date** (`Input type="date"` を横並び、`grid grid-cols-2 gap-4`)
- フッター: 右寄せで「Cancel」(`variant="ghost"`) と「Create」(`variant="default"`)
- バリデーション: end < start なら end の下に `text-destructive text-xs` でエラー

---

### 画面4: エラー状態（GitHub 接続失敗）

ヘッダーは表示しつつ、本体中央に Card:
- 上に `lucide-react PlugZap` アイコン 32px、`text-destructive`
- 見出し「Connection failed」(`text-lg font-semibold`)
- 説明「Could not load your project from GitHub. Check that GITHUB_PAT and GITHUB_PROJECT_NUMBER are set in `.env.local`.」(`text-sm text-muted-foreground`)
- エラー詳細を `<pre>` で表示（`bg-muted text-xs font-mono p-3 rounded-md max-h-32 overflow-auto`）
- 「Retry」ボタン（`variant="outline"`）

---

### 画面5: ログイン (`/login`) — 既存実装あり、デザインだけ整える

- 中央寄せ縦並び、`max-w-sm w-full`、画面中央 `min-h-screen flex items-center justify-center`
- 上: ロゴ「gantto」(`text-2xl font-semibold`)
- 説明: 「Enter the shared password to continue.」(`text-sm text-muted-foreground`)
- パスワード `Input` (type=password、`autoFocus`)
- 「Sign in」ボタン（フル幅、`variant="default"`、loading 中は spinner）
- エラーは `text-destructive text-sm` で `role="alert"`

---

### アウトプット形式の希望

1. **HTML/Tailwind v4 のマークアップ**（React の JSX 形式、shadcn/ui コンポーネント名 `<Button>` `<Input>` `<Dialog>` `<ToggleGroup>` をそのまま使う）
2. すべての主要画面（1〜5）を1ページに並べたモックアップ
3. **ライトモード版とダークモード版を両方**
4. ダミーデータは現実的な英語タスク6件 + 日本語タスク2件くらい混ぜる（例: "Implement OAuth flow", "ハンズオン資料を書く"）
5. クラス名は既存の CSS 変数を参照する形（`bg-background` `text-foreground` `border-border` 等）。`#hex` 直書き禁止
6. アイコンは `lucide-react` の名前で書く（`<CalendarDays />` `<Plus />` 等）

---

### やってほしくないこと

- 既存テーマ変数を変える / 新しい色を増やす
- 角丸を強くする（`rounded-xl` 以上）
- グラデーションを使う
- 装飾的なイラストやエモジを入れる
- shadcn の既存コンポーネント（`Button` `Input` `Label` `Dialog`）を別物に置き換える
- スマホ用デザインを作る（PC/タブレットのみ）

---

### 補足: ガントチャート特有の難しさ

- バーが画面外（過去・未来）に出るときの省略表現
- 同日に複数タスクが終わる/始まる場合の重なり処理
- 1日未満（数時間）のタスクの最小幅扱い（最低 24px 確保とか）

これらは無理に解決しなくていいけど、頭の片隅に置いてほしい。
