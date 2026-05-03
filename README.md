# numeron

Numer0n 寄せのオンライン対戦（Hit & Blow コア + Supabase）。詳細は `docs/requirements.md`。

## 必要なもの

- Node.js（プロジェクトに合わせた LTS 想定）
- [pnpm](https://pnpm.io/)
- ローカルで Supabase を動かす場合: [Supabase CLI](https://supabase.com/docs/guides/cli) と Docker

## セットアップ（ローカル）

```bash
pnpm install
cp .env.example .env
# .env に VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY を入れる
```

ローカル DB を使う場合（CLI + Docker）:

```bash
supabase start
supabase status   # API URL と anon（publishable）キーを .env に転記
pnpm dev
```

マイグレーションを当て直したいときは `supabase db reset`（データは消える）。

## 本番の Supabase（デプロイは別操作）

Git にプッシュしただけでは、ホストされている Supabase の DB スキーマは更新されない。  
マイグレーションは、ローカルと同じ SQL がリモートの Postgres に明示的に適用される必要がある。

典型手順:

1. [Supabase CLI でリモートプロジェクトにリンク](https://supabase.com/docs/guides/cli/local-development#link-your-project)する（初回・`supabase login` など）。
2. 未適用分のマイグレーションをリモートに反映する:

   ```bash
   supabase db push
   ```

   ローカルの `supabase/migrations/*.sql` のうち、まだホスト側に載っていないものが順に適用される想定。

ダッシュボードの SQL Editor で手実行する方法もあるが、レビュー済みマイグレーションを `db push` で揃える方が再現しやすい。

Edge Functions を使っている場合だけ、関数ごとに `supabase functions deploy` が別途必要。本リポジトリは現状、DB・RLS・RPC が中心であればスキーマは `db push` が主になる。

フロント（Vite）は、ホスティング先のビルド・デプロイが成功しても、向き先 URL／キーは本番用 Supabase プロジェクトの値を設定すること。`.env.example` の `VITE_*` を本番環境変数に設定する。

## リポジトリ構成（ざっくり）

| パス | 内容 |
|------|------|
| `apps/web` | React クライアント |
| `packages/core` | Hit & Blow 採点など Supabase 非依存ロジック |
| `supabase/migrations` | DB スキーマ・RLS・RPC |
| `docs/` | 要件・設計メモ |

## スクリプト

| コマンド | 説明 |
|----------|------|
| `pnpm dev` | 開発パッケージの起動（turbo） |
| `pnpm build` / `pnpm lint` / `pnpm test` | 各パッケージに委譲 |
