# 設計メモ — 第1段（オンライン Hit & Blow）

要件の一次ソースは `requirements.md`。ここでは **第1段** に閉じたデータモデル・権限・同期のたたき台を書く。確定事項ではなく、実装・マイグレーションの起点。

---

## 1. スコープ

- 2 プレイヤーが **別クライアント** から同一ルームに参加する。
- **双方がそれぞれ秘密の N 桁を持つ**（Numer0n と同型の双方向）。**交互にコール**し、コールに対する Hit/Blow は **相手の秘密**を基準に返す。
- **先に相手の番号を当てたプレイヤーが勝ち**（`hit = N` が自分のコールで成立した时刻）。
- ゲーム状態と手履歴の **正本は Postgres**。Realtime は通知用（取りこぼしは第2段で方針化、`requirements.md` の信頼性参照）。

**第1段で含めない（第2段へ）**: イート、番組寄せの細部、その他 Numer0n 拡張。

---

## 2. 認証

- **匿名ログイン（Supabase Auth `signInAnonymously`）** で各クライアントに `auth.uid()` を付与し、RLS の主体にする想定。メール認証は後から差し替え可能。
- クライアントに **service_role** は載せない（anon / publishable key のみ）。

---

## 3. テーブル（たたき台）

名前は実装時にマイグレーションで確定する。関係性だけ示す。

### 3.1 `rooms`

| 列 | 型 | 説明 |
|----|----|------|
| `id` | `uuid` PK | ルーム ID |
| `short_code` | `text` UNIQUE | 参加用の短いコード |
| `status` | `text` | `waiting` / `playing` / `finished` |
| `digit_length` | `smallint` | 3 または 4 |
| `created_at` | `timestamptz` | |
| `created_by` | `uuid` | 作成者 |
| `current_turn_user_id` | `uuid` nullable | 交互コールの手番。開始条件（二人・秘密確定後）でセット |
| `winner_user_id` | `uuid` nullable | 終了時に先に当てたプレイヤー（マッチ最終局の勝者＝マッチ勝者） |
| `match_wins_required` | `smallint` | 先取 1〜10（`1`＝従来の 1 ゲームのみ） |
| `match_wins` | `jsonb` | ユーザー ID 文字列キー・ゲーム単位の勝ち数の累積 |
| `current_game_index` | `int` | マッチ内の現在のゲーム番号（1 始まり） |

### 3.2 `room_members`

**対称な二人**。役割は「秘密をそれぞれ持つプレイヤー」で揃える（`secret_holder` / `guesser` の非対称は廃止）。

| 列 | 型 | 説明 |
|----|----|------|
| `room_id` | `uuid` FK → `rooms` | |
| `user_id` | `uuid` | `auth.uid()` |
| `joined_at` | `timestamptz` | |

制約例: `(room_id, user_id)` UNIQUE、ルームあたり **最大 2 名**（CHECK またはトリガー）。

### 3.3 `room_secrets`

**プレイヤーごとに 1 行**（双方向）。

| 列 | 型 | 説明 |
|----|----|------|
| `room_id` | `uuid` | FK |
| `user_id` | `uuid` | 秘密の所有者 |
| `digits` | `text` | 重複なし・桁揃い（先頭 0 可） |

主キー: `(room_id, user_id)`。

- 行の **所有者**（`user_id = auth.uid()`）だけがその行の **SELECT / INSERT / UPDATE** 可。
- **相手の行は読めない**（RLS で禁止）。採点は **SECURITY DEFINER** のトリガー／関数内だけが相手の `digits` を読む。

### 3.4 `guesses`

コール履歴。正本。

| 列 | 型 | 説明 |
|----|----|------|
| `id` | `uuid` PK | |
| `room_id` | `uuid` FK | |
| `guesser_id` | `uuid` | コールした人 |
| `digits` | `text` | コール |
| `hit` | `smallint` | |
| `blow` | `smallint` | |
| `created_at` | `timestamptz` | |

採点の方針（推奨）:

- **サーバ側で確定**: `INSERT` 時に `SECURITY DEFINER` 関数／トリガーが **同一 `room_id` の相手（`guesser_id` でない方）の `room_secrets.digits`** を読み、`hit` / `blow` を計算する。
- ルールは `packages/core` の式と一致させ、テストで確認。

**手番**: `guesses` の INSERT は **`rooms.current_turn_user_id = auth.uid()`** のときのみ許可（RLS またはトリガー）。直後に **手番を相手に更新**（`AFTER INSERT`）。終了時は手番更新を止め `status = finished` と `winner_user_id` をセット。

ゲーム開始条件の例: メンバーが 2 名かつ **両方の `room_secrets` が揃った**ら `playing` とし、先攻を `created_by` または固定ルールで `current_turn_user_id` に入れる。

---

## 4. Row Level Security（意図）

- 全テーブルで RLS を有効化。
- **`room_members` に行があるユーザーだけ** が、その `room_id` の `rooms` / `guesses` を読める。
- `room_secrets` は **自分の行だけ** 読める・書ける。
- `guesses` の INSERT は **自分の番のとき**（上記）かつ `guesser_id = auth.uid()`。

ポリシーはマイグレーションにベタ書きし、Dashboard だけの変更でドリフトしないようにする（`implement-plan.md` の IaC 参照）。

---

## 5. Realtime（Postgres Changes）

- `guesses` と `rooms` を `supabase_realtime` publication に追加。
- クライアントは `postgres_changes` で **新しいコール・ルーム状態**を購読。
- 初回・再接続時は **`select` で履歴／状態を再取得**。

---

## 6. フロントの環境変数

| 変数 | 用途 |
|------|------|
| `VITE_SUPABASE_URL` | プロジェクト URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable（旧 anon 相当） |

`.env.example` をリポジトリに置き、実値はコミットしない。

---

## 7. 第2段で足す余地（メモのみ）

- **イート**、同一コール禁止、その他番組ルール。
- private Broadcast、Presence など。
