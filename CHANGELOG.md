# Changelog

## v1.0.1 — 2026-10-15

不具合の修正版です。設定（変数とシークレット）の変更は要りません。 / Bug fix release. No settings (variables and secrets) need to change.

### 日本語

**直したこと**

- 翻訳ログのデータベースの URL（`NOTION_DATABASE`）に、ブラウザのアドレス欄からコピーした URL をそのまま使えるように。ビューの `?v=…` や、行を開いたままの `?p=…` が付いていると、そちらの ID が使われて記録できなかった。ブロックへのリンク（`#…`）も同じ（#1）
- Soniox の API キーの誤り・残高不足・利用の上限のとき、3分間「再接続中…」が続いたあと「電波の良い場所で」と出て、電波の問題に見えていた。すぐ止めて「Soniox の API キーが使えません」「Soniox の残高が足りません」などと原因を出す。翻訳の途中で切られたときは、これまでどおりつなぎ直す（#2）
- Notion に書き込めなかった発言（電波が途切れた直後の発言など）が、会話ページに残らず失われていた。次の発言を書けたときと「終了」のときに書き直す。書き直した発言はページの下に付き、まれに同じ発言が2つ書かれることがある（#9）
- キーが未登録の端末で「翻訳を開始」を押すと、「SONIOX_API_KEY が設定されていません」と出てサーバーの設定の問題に見えていた（#6）
- 「接続中…」の間に「終了」すると、終了後も経過時間が進み、画面が消えなくなることがあった（#7）
- `NOTION_DATABASE` を使っているとき、「Notionページを準備」が何も作っていないのに「翻訳ログを追加しました」と報告していた。データベースを開けないときはエラーを出す（#8）

**更新のしかた**

- README の「新しい版に更新する」の手順で `v1.0.1` を取り込みます。手順に `':(exclude).github'` を足しました（このリポジトリの開発用の自動テストなどの設定は取り込まない）
- 新しいファイル：`public/soniox-errors.js`

**開発**

- Pull Request ごとに自動テスト（Node.js 22 と 20）と CodeQL を実行し、main へのマージにはすべての成功が必要。コピーされた各自のリポジトリでは動かない
- 自動テスト 66件

### English

**Fixes**

- `NOTION_DATABASE` now accepts the URL copied from the browser's address bar as is. With a view (`?v=…`) or an open row (`?p=…`) in the URL, that ID was used instead and nothing was logged. Links to a block (`#…`) had the same problem (#1)
- A wrong Soniox API key, insufficient balance or a usage limit showed 「再接続中…」 (reconnecting) for 3 minutes and then a message about the signal. The app now stops right away and says what to check (「Soniox の API キーが使えません」 the key doesn't work, 「Soniox の残高が足りません」 insufficient balance, …). If a session is cut off mid-conversation, it still reconnects (#2)
- Utterances that failed to reach Notion (e.g. just after the signal dropped) were lost from the conversation page. They are now written again after the next successful write and when you end the conversation. Rewritten utterances appear at the bottom of the page, and in rare cases one may appear twice (#9)
- On a device without a registered key, tapping 「翻訳を開始」 (start) showed 「SONIOX_API_KEY が設定されていません」, which looked like a server problem (#6)
- Ending during 「接続中…」 (connecting) could leave the elapsed time running and keep the screen awake (#7)
- With `NOTION_DATABASE`, 「Notionページを準備」 (prepare Notion page) reported that it added the log database when it added nothing. It now shows an error if the database can't be opened (#8)

**Updating**

- Follow "Updating to a new version" in the README with `v1.0.1`. The steps now include `':(exclude).github'` (this repository's CI and other development settings are not pulled in)
- New file: `public/soniox-errors.js`

**Development**

- Every pull request runs the automated tests (Node.js 22 and 20) and CodeQL, and all must pass before merging into main. They don't run in copies of this repository
- 66 automated tests

## v1.0.0 — 2026-10-05

最初の公開版です。 / First public release.

### 日本語

**できること**

- iPhone で対面の会話を聞き取り、リアルタイムに双方向翻訳（Soniox。話す言語は自動判定）
- 60言語から2つを選べる（標準は日本語⇄英語）。相手の言語の一覧は、相手が読めるようその言語での名前で表示（例：相手が英語なら「Español (Spanish)」）。対面表示では相手側の見出しもその言語の名前で表示
- Notion の「翻訳ログ」データベースへ話すそばから記録。会話ごとに1行（日時・長さ・発言数）、会話ページは「ログ」「2列（対訳）」のタブ
- 「•••」→「Notionページを準備」で、説明・「翻訳をはじめる」ボタン・翻訳ログをまとめて作成。記録先のページは、翻訳ログのデータベース、なければ Notion の接続を追加したページから自動で判定
- 3つの表示：ログ（話した言葉を大きく、訳を灰色で）／2列／対面（上半分を相手向けに逆さで表示）
- 用語の登録。Notion・AI 関連の主な語句は最初から登録済みで、製品名は訳しても英字のまま
- 電波が弱いとき：Opus 32kbps で圧縮して送信、切断中は直近15秒をためて送り直し、3分間つなぎ直し、遅れが20秒を超えたら読み飛ばし
- 5分声が聞こえないと自動で一時停止。翻訳中は画面を消さない
- 「Deploy to Cloudflare」ボタンで、各自の Cloudflare に公開（API キーは各自）

**セキュリティ**

- 翻訳画面と API はアクセスキー（16文字以上）で保護。初めての端末は入力欄から登録、または登録済みの端末の「別の端末を登録」リンク（キーは `#k=…` に入り、サーバーには送られない）で登録。リンクのキーは正しいと確かめてから端末に覚える
- Soniox の本物のキーはブラウザに渡さず、使い捨て・60秒の一時キー（1回の接続は最長3時間）を発行
- ブラウザに渡す Notion の ID に署名を付け、アプリが作った会話ページ・ブロック以外は書き換えられない
- Notion の埋め込みの URL にはアクセスキーを入れない
- 個人のトークン（PAT）では記録先を自動で決めず、`NOTION_PARENT_PAGE` の設定を求める
- CSP などのセキュリティ用のヘッダー（`public/_headers`）
- SECURITY.md（非公開の脆弱性報告）・CONTRIBUTING.md・Issue のテンプレート。Pull Request はメンテナーだけが作れる設定

**確認済み**

- iPhone の Safari、Mac の Chrome
- 本物の Soniox（Opus で送った音声、日本語⇄英語・中国語）と本物の Notion（データベースの作成、タブ、話すそばからの追記）
- 自動テスト 59件

**制限**

- 画面は日本語のみ
- Notion の埋め込みの中ではマイクが使えないため、埋め込みは起動ボタンだけ
- 圏外ではリアルタイムの聞き取り・翻訳はできない
- ローカルで動かすときは Node.js 20 以上

### English

**Features**

- Listens to a face-to-face conversation on iPhone and translates both ways in real time (Soniox, automatic language detection)
- Pick any two of 60 languages (Japanese ⇄ English by default). The partner's language list shows each language in its own name plus its name in the partner's language (e.g. 「Español (Spanish)」 for an English-speaking partner), and the face-to-face view shows your partner's heading in their own language
- Logs to a Notion "翻訳ログ" database as you speak: one row per conversation (date, length, utterance count), with "Log" and "Side-by-side" tabs on each conversation page
- "•••" → 「Notionページを準備」 creates the guide, a launch button and the log database in one tap. The log page is detected automatically from the log database, or from the page you added the Notion connection to
- Three views: log (what was said in large text, translation in gray), two columns, and face-to-face (top half upside down)
- Custom terms, with common Notion and AI terms built in; product names stay in Latin letters when translated
- Weak networks: Opus 32 kbps compression, 15 s of audio buffered while disconnected, reconnection for 3 minutes, skipping when more than 20 s behind
- Pauses automatically after 5 minutes of silence; keeps the screen awake while translating
- "Deploy to Cloudflare" button: everyone deploys to their own Cloudflare account with their own API keys

**Security**

- The app and API are protected by an access key (at least 16 characters). Register a new device by typing the key or with a "register another device" link from a registered device (the key sits in `#k=…` and is never sent to the server). A link's key is verified before it is remembered
- The real Soniox key never reaches the browser; a single-use 60-second temporary key is issued instead (one connection lasts at most 3 hours)
- Notion IDs passed to the browser are signed, so only conversation pages and blocks created by the app can be written to
- The Notion embed URL never contains the access key
- With a personal access token (PAT), the app doesn't pick a log page automatically and asks for `NOTION_PARENT_PAGE`
- Security headers such as CSP (`public/_headers`)
- SECURITY.md (private vulnerability reporting), CONTRIBUTING.md and issue templates. Pull requests are limited to maintainers

**Verified**

- Safari on iPhone, Chrome on Mac
- Real Soniox (Opus audio; Japanese ⇄ English and Chinese) and real Notion (database creation, tabs, live appends)
- 59 automated tests

**Limitations**

- The UI is in Japanese only
- Microphones don't work inside Notion embeds, so the embed is only a launch button
- Real-time recognition and translation don't work offline
- Running locally requires Node.js 20 or later
