# 実装計画

`requirements.md` の第1段から進める。**詳細設計の一次参照は `supabase-design.md`**。

---

## 進め方（ステップ）

### 1. インフラとしての Supabase（IaC）

- リポジトリに **Supabase CLI** 構成を置く（後述）。
- スキーマ・RLS・関数／トリガー・publication（Realtime 用）は **`supabase/migrations/*.sql` にのみ** 定義し、レビュー可能な差分にする。
- ローカル検証: `supabase start` → マイグレーション適用 → アプリから接続。
- リモート反映: `supabase link` 後に `db push`、または CI からマイグレーション適用（運用はチームで決定）。

### 2. `packages/core` の拡張

- 桁数・重複なし・先頭 0 を含む **入力正規化とバリデーション**（文字列 ⇔ 数字配列）。
- 既存の `scoreHitBlowWithDigits` をその入口から利用。
- **Vitest** で表形式のテストを数本（オンライン層はこの結果に寄せる／DB 側の式と一致を別途確認）。

### 3. `apps/web` — フロー優先

- Supabase クライアント生成（環境変数は `supabase-design.md` 参照）。
- 匿名ログイン → ルーム作成／参加（`short_code` または URL 共有）。
- **二人とも自分の秘密を登録** → 揃ったら **交互コール**（手番は `rooms.current_turn_user_id` 等、`supabase-design.md` 参照）。
- **書き込みは DB 正、表示は Changes + 初回／フォールバックで `select`**。
- 失敗時は **エラー表示**（成功の Silent フォールバックはしない、`requirements.md` どおり）。

### 4. 手動・2 クライアント検証

- 2 ブラウザまたは 2 タブで **双方向プレイが完走**することを第1段の完了チェックにする。
- 接続が悪いときの挙動はメモだけ残し、対策の本番は第2段（信頼性）。

### 5. モノレポの置き場所

- Supabase に依存する薄いコード（クライアント生成、型）は `apps/web` 内、または後で `packages/` に切り出し。
- ルールは常に **`@numeron/core` 側**に寄せる。

---

## IaC について（スキーマをコードで管理できるか）

**できる。公式の定番は「Supabase CLI + SQL マイグレーションを Git 管理」** だと思ってよい。

| 手段 | 内容 |
|------|------|
| **推奨** | [Supabase CLI](https://supabase.com/docs/guides/cli) で `supabase init`。スキーマ変更は `supabase/migrations/<timestamp>_*.sql` に追加。ローカル・本番へ同じ SQL を適用する。 |
| 補助 | `config.toml` でローカル設定。Dashboard で試した変更は **`db diff` 等でマイグレーションに落とす**運用にするとドリフトしにくい。 |
| その他 | Terraform / Pulumi 用のサードパーティ連携もあるが、**プロジェクトの主流はマイグレーションSQL** としておくのがシンプル。 |

第3者向け「完全 Terraform だけで Supabase プロジェクト作成まで」はプラットフォーム都合で重くなりがちなので、このリポジトリでは **マイグレーションを正本** とする前提で進める想定。

---

## 実装後の確認（コマンド）

- ルート: `pnpm lint` · `pnpm build` · `pnpm test`（core の Vitest を含む）。
- ローカル DB: **Docker 起動後** `supabase start` または `supabase db reset` でマイグレーションが通ること。`.env` は `.env.example` を参考に `supabase status` の URL / anon key を設定。
- 手動: 2 ウィンドウでルーム作成→参加→両者秘密→交互コール→勝敗。

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `requirements.md` | 要件・段階・信頼性の扱い |
| `supabase-design.md` | 第1段の ER 意図・RLS・Realtime・環境変数 |
