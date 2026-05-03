# デプロイ手順（Numeron）

フロントは **Vite の静的ビルド**（`apps/web/dist`）。バックは **Supabase ホスト**を想定する。ローカル専用の `127.0.0.1:54321` は本番では使わない。

---

## ローカルで `GET …/auth/v1/user` が 403 になる件

起動時に **`auth.getUser()`** でサーバに JWT を検証している。このとき次のような状況だと **403 Forbidden** が一度返ることがある。

- **`supabase db reset` や DB を消したあと**、ブラウザに **古い匿名セッション**（localStorage）が残っている
- アクセストークンはまだあるが、**`auth.users` にそのユーザーがいない**（またはセッションが無効）

このあと **`signOut()` → `signInAnonymously()`** が走って復帰できていれば **想定どおりの挙動**で、デプロイの阻害にはならない。ネットワークタブに赤い 1 本が残るだけのことが多い。

**常に 403 のまま終わる**場合は、`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` の取り違えや、リモートで匿名サインインが無効などを疑う。

---

## 1. Supabase（クラウド）

1. [Supabase](https://supabase.com) でプロジェクトを作成する。
2. **SQL**: ローカルと同じマイグレーションを適用する。
   - 開発マシンで CLI を使う場合の例: プロジェクトを link したうえで `supabase db push`
   - またはダッシュボードの SQL Editor で `supabase/migrations/*.sql` を順に実行（運用はチームで統一するのがよい）
3. **Authentication → Providers → Anonymous users** を **有効**にする（ローカルの `enable_anonymous_sign_ins = true` と揃える）。
4. **Project Settings → API** から **Project URL** と **anon public** キーを控える（フロントの環境変数に使う）。
5. **Realtime**: マイグレーションで `supabase_realtime` に `rooms` / `guesses` を追加済みなら、ホスト側でもマイグレーション適用後に問題なく動く想定。

---

## 2. フロント（静的ホスティング）

モノレポの **ルートで** 依存を解決し、`@numeron/core` をビルドしてから web をビルドする。

### 環境変数（ビルド時に埋め込まれる）

リポジトリ直下の `.env` と同じ名前で、ホスティング側に設定する。

| 変数名 | 説明 |
|--------|------|
| `VITE_SUPABASE_URL` | クラウドプロジェクトの Project URL（`https://xxxx.supabase.co`） |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **anon** の public キー（`service_role` はクライアントに渡さない） |

変更後は **再ビルド**が必要。

### ビルドコマンドの例（ルートがリポジトリルートのとき）

```bash
corepack enable
pnpm install
pnpm build
```

`pnpm build` は Turbo で `@numeron/core` → `@numeron/web` の順になる。

**出力ディレクトリ**: `apps/web/dist`

### ホスティング設定の例（汎用）

- **Install command**: `pnpm install`（Node 20 系推奨）
- **Build command**: `pnpm build`
- **Publish directory / Output**: `apps/web/dist`

（Vercel / Netlify など、ダッシュボード上の項目名はサービスごとに違う。）

### Cloudflare Pages

Git 連携でリポジトリルートをそのまま使う想定。

| 項目 | 値の例 |
|------|--------|
| フレームワークプリセット | **なし**（静的サイト）など、自動検出に任せず静的ビルドでよい |
| ビルドコマンド | `pnpm install && pnpm build` |
| ビルド出力ディレクトリ | `apps/web/dist` |
| 環境変数 | **Settings → Environment variables** に `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`（Production に入れる。Preview も使うなら同様に） |
| Node | 互換のため **20 系**を指定するとよい（**Environment variables** で `NODE_VERSION` = `20` など）。未指定なら Pages の build image 既定（v3 では Node 22 系）でも動くことが多い。 |
| pnpm（任意） | リポジトリは `pnpm@9.15.9`。**Environment variables** に `PNPM_VERSION` = `9`（または [Build image](https://developers.cloudflare.com/pages/configuration/language-support-and-tools/) の表に合わせた値）を足すと、ローカルに寄せやすい。 |

`package.json` の `packageManager`（`pnpm@…`）だけに頼ると、Pages の v3 では lockfile から pnpm バージョンを拾わないことがある（[制限の記述](https://developers.cloudflare.com/pages/configuration/language-support-and-tools/#limitations)）。ビルドが npm で走って失敗するようなら `PNPM_VERSION` を明示する。

**URL とサブドメイン**

- 未設定なら **`プロジェクト名.pages.dev`** が付くだけで、追加作業はほぼない。
- **独自のサブドメイン**（例: `numeron.example.com`）を付けたい場合: プロジェクトの **Custom domains** からドメインを追加する。
  - そのゾーンが **すでに同じ Cloudflare アカウントで DNS 管理**されていることが多いと、向き先のレコード案内が簡単で、**ルートの apex より手間は少なめ**なことが多い。
  - DNS が別業者なら、ビルド後に表示される **`*.pages.dev` 向けの CNAME** を、そのサブドメインに 1 本足すイメージ。
- URL を変えたら、Supabase の **Authentication → URL Configuration** で **Site URL** やリダイレクト許可リストが必要になるケースがある（匿名のみでも、`pages.dev` から独自ドメインに変えたあとなどは一度確認してよい）。

### 単体で web だけ先にビルドしたい場合

```bash
pnpm install
pnpm build --filter=@numeron/web
```

---

## 3. 本番動作確認の最低限

1. デプロイした URL を開き、エラー表示なく匿名ログインできる。
2. 別ブラウザまたはシークレットで 2 クライアントから **ルーム作成 → 参加 → ナンバー → 交互コール**まで一通り試す。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `docs/memo.md` | env の場所・RLS の注意など |
| `docs/supabase-design.md` | ER・RLS の意図 |
| `.env.example` | クライアント用 env 名 |
