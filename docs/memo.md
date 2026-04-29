# 再開用メモ（Numeron / 第1段）

次のセッションでコンテキストが空でも迷いにくいよう、決定事項とハマりどころだけ残す。要件・設計の一次ソースは `requirements.md` / `supabase-design.md` / `implement-plan.md`。

---

## プロジェクトの形

- **pnpm + Turbo** のモノレポ。`packages/core`（純 TS・Hit&Blow）、`apps/web`（Vite + React + Supabase クライアント）。
- **Supabase CLI**: `supabase/` に `config.toml`、マイグレーションは `supabase/migrations/*.sql` のみを正本とする。匿名ログイン有効（`enable_anonymous_sign_ins = true`）。

---

## 第1段スコープ（実装済みの意図）

- **双方向**: 両者が秘密を持ち、**相手の秘密**に対して Hit/Blow。交互コール、先に `hit = N` が出た側の勝ち。
- **イート・番組寄せ・演出本番・信頼性の深掘り**はまだやっていない。

---

## 環境変数（重要）

- `.env` は**リポジトリ直下**でよい。`apps/web/vite.config.ts` の `envDir` が `../..` を指しており、Vite がそこを読む。
- クライアントに出す名前は **`VITE_SUPABASE_URL`** と **`VITE_SUPABASE_PUBLISHABLE_KEY`**（`VITE_` 必須）。変えたら `pnpm dev` を再起動。
- クライアントは [`getSupabase()`](apps/web/src/lib/supabase.ts) 経由。未設定で `createClient('', '')` はしない。

---

## DB / RLS で一度ハマった点（再発防止）

1. **`INSERT ... RETURNING`** は RLS の **SELECT** も通る。`rooms` 作成直後はまだ `room_members` にいないので、「メンバーのみ SELECT」だとルーム作成が 500 になりうる。
2. **参加前**に `short_code` で `rooms` を 1 件読むため、メンバー条件だけだと参加側も読めない。
3. 対策: [`20250429170000_fix_rooms_select_rls.sql`](supabase/migrations/20250429170000_fix_rooms_select_rls.sql) — `created_by` 一致 **または** メンバー **または** `status = 'waiting'` で SELECT 可。`waiting` 一覧が取れる抜け道はあるが、第1段では許容。

---

## よく使うコマンド

```bash
pnpm install
pnpm lint && pnpm build && pnpm test
pnpm dev   # Turbo: core の tsc watch + web の Vite
```

ローカル DB（Docker 前提）:

```bash
supabase start   # または db reset でマイグレーション全適用
supabase status  # URL / anon key を .env に反映
```

---

## 実装ファイルの所在（参照用）

| 領域 | パス |
|------|------|
| スキーマ・RLS・トリガー・Realtime publication | `supabase/migrations/20250429160000_initial_schema.sql` ほか |
| コアロジック・Vitest | `packages/core/src/` |
| UI・リアルタイム購読 | `apps/web/src/App.tsx` |
| クライアント | `apps/web/src/lib/supabase.ts` |

---

## まだやっていない / 第2段以降

- イート、番組ルールの細部、Jotai + Framer の本格 UI。
- Realtime 取りこぼし・再接続の方針の実装（要件では第1段で観測メモ → 第2段で指針化）。
- `waiting` ルームを広く読めるポリシーを、RPC などで絞るならその設計。
- CI・本番デプロイの固定。

---

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| `requirements.md` | 要件・段階 |
| `supabase-design.md` | ER・RLS 意図 |
| `implement-plan.md` | 手順・確認コマンド |
| `memo.md` | 本ファイル（ハンドオフ用） |
