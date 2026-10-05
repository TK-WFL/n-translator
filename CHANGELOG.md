# Changelog

## v1.0.0 — 2026-10-05

最初の公開版です。 / First public release.

### 日本語

**できること**

- iPhone で対面の会話を聞き取り、リアルタイムに双方向翻訳（Soniox。話す言語は自動判定）
- 60言語から2つを選べる（標準は日本語⇄英語）。対面表示では相手側の見出しをその言語の名前で表示
- Notion の「翻訳ログ」データベースへ話すそばから記録。会話ごとに1行（日時・長さ・発言数）、会話ページは「ログ」「2列（対訳）」のタブ
- 「•••」→「Notionページを準備」で、説明・「翻訳をはじめる」ボタン・翻訳ログをまとめて作成。記録先のページは Notion の接続を追加したページから自動で判定
- 3つの表示：ログ（話した言葉を大きく、訳を灰色で）／2列／対面（上半分を相手向けに逆さで表示）
- 用語の登録。Notion・AI 関連の主な語句は最初から登録済みで、製品名は訳しても英字のまま
- 電波が弱いとき：Opus 32kbps で圧縮して送信、切断中は直近15秒をためて送り直し、3分間つなぎ直し、遅れが20秒を超えたら読み飛ばし
- 5分声が聞こえないと自動で一時停止。翻訳中は画面を消さない
- アクセスキーで保護。初めての端末は入力欄から登録、または登録済みの端末の「別の端末を登録」リンクで登録
- Soniox の本物のキーはブラウザに渡さず、使い捨て・60秒の一時キーを発行
- 「Deploy to Cloudflare」ボタンで、各自の Cloudflare に公開（API キーは各自）

**確認済み**

- iPhone の Safari、Mac の Chrome
- 本物の Soniox（Opus で送った音声、日本語⇄英語・中国語）と本物の Notion（データベースの作成、タブ、話すそばからの追記）
- 自動テスト 53件

**制限**

- 画面は日本語のみ
- Notion の埋め込みの中ではマイクが使えないため、埋め込みは起動ボタンだけ
- 圏外ではリアルタイムの聞き取り・翻訳はできない

### English

**Features**

- Listens to a face-to-face conversation on iPhone and translates both ways in real time (Soniox, automatic language detection)
- Pick any two of 60 languages (Japanese ⇄ English by default). In the face-to-face view, your partner's heading shows their language in its own name
- Logs to a Notion "翻訳ログ" database as you speak: one row per conversation (date, length, utterance count), with "Log" and "Side-by-side" tabs on each conversation page
- "•••" → 「Notionページを準備」 creates the guide, a launch button and the log database in one tap. The log page is detected automatically from the page you added the Notion connection to
- Three views: log (what was said in large text, translation in gray), two columns, and face-to-face (top half upside down)
- Custom terms, with common Notion and AI terms built in; product names stay in Latin letters when translated
- Weak networks: Opus 32 kbps compression, 15 s of audio buffered while disconnected, reconnection for 3 minutes, skipping when more than 20 s behind
- Pauses automatically after 5 minutes of silence; keeps the screen awake while translating
- Protected by an access key. Register a new device by typing the key or by a "register another device" link from a registered device
- The real Soniox key never reaches the browser; a single-use 60-second temporary key is issued instead
- "Deploy to Cloudflare" button: everyone deploys to their own Cloudflare account with their own API keys

**Verified**

- Safari on iPhone, Chrome on Mac
- Real Soniox (Opus audio; Japanese ⇄ English and Chinese) and real Notion (database creation, tabs, live appends)
- 53 automated tests

**Limitations**

- The UI is in Japanese only
- Microphones don't work inside Notion embeds, so the embed is only a launch button
- Real-time recognition and translation don't work offline
