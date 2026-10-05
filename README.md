# N-Translator（対面翻訳 for Notion）

対面の会話を iPhone で聞き取ってリアルタイムに双方向翻訳し、原文と訳文を Notion に話すそばから記録するツールです。
会議室のプロジェクターに Notion を映しておけば、参加者全員が同じ内容をリアルタイムで読めます。

![左：iPhoneの翻訳画面（2列表示）、右：プロジェクターに映したNotionの2列（対訳）](docs/images/overview.jpg)

- **双方向のリアルタイム翻訳**：話す言語は自動で判定。日本語で話せば相手の言語に、相手の言語で話せば日本語に訳します
- **60言語に対応**：日本語⇄英語が標準。中国語・韓国語・スペイン語・ベトナム語など、60言語から2つを選べます
- **Notion に自動で記録**：会話ごとに「翻訳ログ」データベースへ1行。会話ページは「ログ」と「2列（対訳）」のタブで見返せます
- **3つの表示**：ログ／2列／対面（iPhoneを机に置き、上半分を相手向けに逆さで表示）
- **電波が弱くても使える**：音声を圧縮して送り、途切れても直近の音声をためて送り直します
- **用語の登録**：人名・社内用語・訳し方を登録できます。Notion や AI 関連の主な語句は最初から登録済みです

<p>
  <img src="docs/images/face.jpg" alt="対面表示" width="49%">
  <img src="docs/images/notion-table.jpg" alt="Notionの2列（対訳）。日本語⇄中国語の会話" width="49%">
</p>

> このリポジトリには API キーは入っていません。使う人がそれぞれ自分のアカウント（Soniox・Notion・Cloudflare）で動かします。
> Notion・Soniox・Cloudflare とは関係のない個人のプロジェクトです。

---

## 目次

1. [しくみ](#しくみ)
2. [必要なもの・費用](#必要なもの費用)
3. [セットアップ（約20分）](#セットアップ約20分)
4. [使い方](#使い方)
5. [困ったとき](#困ったとき)
6. [セキュリティとプライバシー](#セキュリティとプライバシー)
7. [新しい版に更新する](#新しい版に更新する)
8. [開発者向け](#開発者向け)

---

## しくみ

```
[iPhone の Safari]  ── 音声（圧縮して送信） ──→  Soniox（音声認識＋翻訳）
   翻訳画面                ←── 原文・訳文 ───
      │
      │ 発言ごとに送信
      ▼
[あなたの Cloudflare Worker]  ── Notion API ──→  Notion「翻訳ログ」データベース
   （API キーはここにだけ置く）                     └→ プロジェクターに映して全員で読む
```

- 翻訳画面は、あなたの Cloudflare（無料プラン）に置くウェブページです。iPhone の Safari で開いて使います
- 音声は iPhone から Soniox に直接送るので、遅れはほとんどありません。Soniox の本物の API キーはブラウザには渡さず、Worker が1回だけ使える一時キー（有効60秒）を発行します
- Notion への書き込みは Worker が代わりに行います

## 必要なもの・費用

| | 用途 | 費用（2026年10月時点。最新は各公式サイトで確認） |
|---|---|---|
| [Soniox](https://soniox.com) | 音声認識と翻訳 | 使った分だけ。リアルタイム認識は約 0.12 ドル／時間（翻訳込み）。要クレジットカード登録 |
| [Notion](https://www.notion.so) | 記録 | 無料プランで可。要約の列を Notion AI で自動入力する場合は Notion AI が必要 |
| [Cloudflare](https://dash.cloudflare.com/sign-up) | 翻訳画面と中継サーバーを置く | 無料プランで可（1日10万リクエストまで） |
| [GitHub](https://github.com/signup) | Cloudflare に公開するときに使う | 無料 |
| iPhone（Safari） | 録音と表示 | Mac・Android の Chrome でも使えます |

声が聞こえない状態が5分続くと自動で一時停止するので、止め忘れても Soniox の料金がかかり続けることはありません。

## セットアップ（約20分）

### 1. Soniox の API キーを作る

1. [Soniox Console](https://console.soniox.com) でアカウントを作ります
2. 支払い方法（クレジットカード）を登録します
3. 「API Keys」で新しいキーを作り、表示されたキーをコピーしてメモ帳などに控えておきます

### 2. Notion の準備

1. Notion で、記録を置くページを1つ作ります（例：「N-Translator」）
2. [インテグレーションの設定画面](https://www.notion.so/profile/integrations) で「新しいインテグレーション」を作ります
   - 名前：`N-Translator` など
   - 種類：内部（Internal）
   - 作ったら「内部インテグレーションシークレット」（`ntn_` で始まる文字列）をコピーして控えます
3. 1. で作ったページを開き、右上の「•••」→「接続」（コネクト）から、2. のインテグレーションを追加します
4. 同じ「•••」→「リンクをコピー」で、ページの URL を控えます

「翻訳ログ」データベースは、最初の会話のときにこのページの中へ自動で作られます。

### 3. Cloudflare に公開する（ボタン1つ）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/TK-WFL/n-translator)

1. 上のボタンを押し、Cloudflare にログインします（アカウントがなければ作ります）
2. GitHub との連携を求められたら許可します。あなたの GitHub に、このリポジトリのコピーが作られます
3. Worker の名前（URL の一部になります）はそのままで構いません
4. 次の4つを入力します

   | 名前 | 入れるもの |
   |---|---|
   | `SONIOX_API_KEY` | 1. でコピーした Soniox の API キー |
   | `ACCESS_KEY` | 翻訳画面を開くための合言葉。自分で決めます（20文字以上のランダムな文字列がおすすめ。パスワード生成機能で作ると安心） |
   | `NOTION_TOKEN` | 2. でコピーしたインテグレーションのシークレット |
   | `NOTION_PARENT_PAGE` | 2. でコピーしたページの URL |

5. 「デプロイ」を押します。1〜2分で完了し、`https://notion-live-translate.<あなたのサブドメイン>.workers.dev` のような URL ができます

あとから値を変えるときは、Cloudflare の管理画面で Worker を開き、「設定」→「変数とシークレット」から変更します。

### 4. iPhone で開く

1. iPhone の Safari で 3. の URL を開きます
2. 「アクセスキー」の欄に、3. で決めた `ACCESS_KEY` を入れて「登録」を押します（その iPhone が覚えるので、次からは入力不要です）
3. 共有ボタン →「ホーム画面に追加」しておくと、アプリのように開けます
4. 「翻訳を開始」を押し、マイクの使用を許可します

### 5. （任意）Notion のページに起動ボタンを置く

Notion のページで `/埋め込み`（`/embed`）を選び、3. の URL を貼り付けると、「翻訳をはじめる」ボタンが表示されます。iPhone では押すと Safari で翻訳画面が開きます。

> Notion の埋め込みの中では、Notion の制限でマイクが使えません。そのため、埋め込みは起動ボタンだけにしています。

## 使い方

1. iPhone で翻訳画面を開きます。相手が英語以外なら、上部の「言語」欄の右側で相手の言語を選びます（⇄ で入れ替え）
2. 「翻訳を開始」を押して話します。最初の発言のあとに、Notion の「翻訳ログ」に会話の行ができ、発言が追記されていきます
3. 会議室では、その Notion ページ（会話のページ）をプロジェクターに映しておくと、参加者もリアルタイムで読めます
4. 終わったら「終了」。発言数と会話の長さが記録されます

### 画面

| 表示 | 内容 |
|---|---|
| ログ | 発言ごとのカード。話した言葉を大きく、その訳を灰色で表示。旗は話された言語、背景が灰色は自分・青は相手 |
| 2列 | 自分の言語と相手の言語を左右に並べて表示 |
| 対面 | 画面を上下に分け、上半分を相手向けに逆さで表示。iPhone を机に置いて向かい合って使います。中央の ✕ で戻ります |

右上の「•••」から、文字の大きさ・用語の編集・別の端末の登録・音声の送り方の確認ができます。

### 用語

人名や社内用語を1行に1つずつ書くと、聞き取りの精度が上がります。`議事録 = meeting minutes` のように書くと、訳し方も固定できます（次に開始・再開したときから反映）。Notion・Claude・ChatGPT・生成AI など、Notion と AI 関連の主な語句は最初から登録してあり、製品名は訳しても英字のまま残します。

### 別の端末を登録する

登録済みの端末で「•••」→「別の端末を登録」→「リンクをコピー」（または「共有…」で AirDrop）。そのリンクを新しい端末のブラウザで開くと登録できます。新しい端末でアクセスキーを直接入力しても構いません。

### Notion の記録

- 記録先は、`NOTION_PARENT_PAGE` のページの中の「翻訳ログ」データベースです（なければ自動で作ります）
- 列：名前（会話 日時）／日時／長さ（分）／発言数／相手（手で選ぶ）／要約
- 会話のページは「💬 ログ」「📖 2列（対訳）」の2つのタブに分かれます
- Notion AI が使えるなら、「要約」の列を AI の自動入力にすると、会話ごとの要約が数分後に入ります
- データベースの名前は「翻訳ログ」のままにしてください（変えると、新しいデータベースを作ります）

### 電波が弱いとき

- 音声は Opus 32kbps に圧縮して送ります（使えないブラウザでは μ-law 128kbps）。「•••」の「音声の送り方」で確認できます
- 途切れている間の音声は直近15秒分ためておき、つながり直したら送ります。つなぎ直しは3分間続けます
- 送れずにたまった音声が20秒を超えたら、リアルタイムを優先して一部を読み飛ばします
- 圏外ではリアルタイムの聞き取り・翻訳はできません（クラウドで処理するため）

### iPhone で使うときの注意

- 録音中は翻訳画面を開いたままにしてください。他のアプリに切り替えたり画面をロックしたりすると、iPhone の仕様で録音が止まるため一時停止します。戻って「再開」を押すと同じ会話の続きになります
- 翻訳中は画面が自動で消えないようにしています
- Notion アプリ内のブラウザでマイクが使えないときは、共有ボタンから「Safari で開く」を選んでください

## 困ったとき

| 症状 | 対処 |
|---|---|
| 「アクセスキーが登録されていません」 | `ACCESS_KEY` に設定した値を入力して「登録」。忘れた場合は Cloudflare で `ACCESS_KEY` を設定し直します |
| 「SONIOX_API_KEY が設定されていません」／「Soniox: …」のエラー | Cloudflare の「変数とシークレット」でキーを確認。Soniox の残高・支払い方法も確認します |
| 「Notionの翻訳ログを作れませんでした」 | ページにインテグレーションが接続されているか、`NOTION_PARENT_PAGE` がそのページの URL か、`NOTION_TOKEN` が正しいかを確認します |
| 「マイクを使えませんでした」 | iPhone の設定で Safari のマイクを許可。アプリ内ブラウザなら Safari で開き直します |
| 勝手に「一時停止中」になる | 5分間声が聞こえなかった／画面を離れた／マイクが使えなくなった。「再開」で続きから翻訳できます |
| 特定の言葉を聞き間違える | 「用語」欄に足します |
| 「翻訳ログ」が2つできた | データベースの名前を「翻訳ログ」に戻し、新しくできた方を削除します |

## セキュリティとプライバシー

- API キーとトークンは、あなたの Cloudflare の「シークレット」にだけ保存されます。コードや画面には入りません
- 翻訳画面と API は `ACCESS_KEY` がないと使えません。`ACCESS_KEY` を知っている人は、あなたの Soniox と Notion を使えてしまうので、他の人に教えないでください。漏れたかもしれないときは Cloudflare で値を変えます
- Notion インテグレーションは、記録用のページにだけ接続してください（アプリは Notion の内容を読み出しません）
- 音声は Soniox で処理されます。取り扱いは [Soniox のセキュリティとプライバシー](https://soniox.com/docs/stt/security-and-privacy) を確認してください。会話がクラウドで処理され Notion に残ることは、相手にも伝えてください
- Soniox の管理画面で利用上限を設定しておくと、万一キーが漏れたときの歯止めになります

## 新しい版に更新する

3. で Cloudflare が作った、あなたの GitHub のリポジトリに変更を取り込むと、Cloudflare が自動で公開し直します。

```bash
git clone https://github.com/<あなたのアカウント>/<作られたリポジトリ>.git
cd <作られたリポジトリ>
git fetch https://github.com/TK-WFL/n-translator.git main
git checkout FETCH_HEAD -- .
git commit -m "N-Translator を最新版に更新"
git push
```

設定した API キーなどはそのまま引き継がれます。

## 開発者向け

### 自分のパソコンで動かす

```bash
cp .dev.vars.example .env   # 値を書き込む（ACCESS_KEY は空でも可）
node server.mjs             # http://localhost:8787
```

API キーなしで画面だけ試すときは `http://localhost:8787/?demo` を開きます（用意した会話が流れます）。

### コマンドで Cloudflare に公開する

```bash
npx wrangler login
npx wrangler secret put SONIOX_API_KEY
npx wrangler secret put ACCESS_KEY
npx wrangler secret put NOTION_TOKEN
npx wrangler secret put NOTION_PARENT_PAGE
npx wrangler deploy
```

### テスト

```bash
npm test
```

### ファイル構成

| ファイル | 役割 |
|---|---|
| `worker.js` / `wrangler.jsonc` | Cloudflare Workers の入口と設定 |
| `lib/api.js` | API（アクセスキーの確認、Soniox の一時キー発行、Notion への記録） |
| `server.mjs` | ローカルで動かすときのサーバー |
| `public/index.html` / `style.css` | Notion 風の画面（埋め込み時は起動ボタンだけ） |
| `public/app.js` | 録音 → Soniox、表示、Notion への同期、自動一時停止 |
| `public/codec.js` / `uplink.js` | 音声の圧縮と送信（途切れたときのため方・詰まったときの読み飛ばし） |
| `public/segmenter.js` / `turns.js` | Soniox の結果を発言・ターンにまとめる |
| `public/languages.js` | 60言語の一覧と言語ごとの扱い |
| `public/context.js` | 最初から登録済みの用語 |
| `public/demo.js` | `?demo` の会話データ |
| `test/` | 自動テスト |

## ライセンス

[MIT](LICENSE)

---

## English summary

**N-Translator** is a face-to-face, two-way live translator for iPhone that writes the original and translated text into Notion as you speak — put the Notion page on a projector and everyone in the room can follow along.

- Real-time two-way translation (auto language detection, 60 languages) powered by [Soniox](https://soniox.com)
- Every conversation is logged to a Notion database, with "Log" and "Side-by-side" tabs
- Log, two-column and face-to-face (upside-down) views; works on weak networks (Opus compression, buffering)
- Self-hosted: deploy to your own Cloudflare account with the button above, and enter your own `SONIOX_API_KEY`, `ACCESS_KEY` (a passphrase you choose), `NOTION_TOKEN` and `NOTION_PARENT_PAGE` (page URL). No keys are included in this repository.

The UI is in Japanese. Not affiliated with Notion Labs, Soniox or Cloudflare.
