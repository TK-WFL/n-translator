# Security Policy / セキュリティについて

## 日本語

### 脆弱性の報告

セキュリティ上の問題を見つけたら、**公開の Issue には書かず**、GitHub の非公開の報告機能を使ってください。

1. このリポジトリの **Security** タブ → **Report a vulnerability** を開く
2. 内容・再現手順・影響を書いて送信する

内容を確認し、対応を返信します。修正が公開されるまで、内容は公開しないでください。

### 対象

修正は最新のリリースに入れます。古い版を使っている場合は、README の「新しい版に更新する」で更新してください。

- このリポジトリのコード（Cloudflare Worker・翻訳画面・Notion への記録）
- README のセットアップ手順のうち、利用者の秘密情報の扱いに関わる部分

Soniox・Notion・Cloudflare のサービス自体の問題は、それぞれの提供元に報告してください。

### 利用者へのお願い

- `SONIOX_API_KEY`・`ACCESS_KEY`・`NOTION_TOKEN` は Cloudflare のシークレットにだけ保存し、Issue・チャット・スクリーンショットに含めないでください
- 漏れたかもしれないときは、Soniox と Notion でキーを作り直し、Cloudflare の値を差し替えてください（`ACCESS_KEY` も新しい値に）
- 登録済みの端末をなくしたときは、Cloudflare で `ACCESS_KEY` を新しい値に変えてください（その端末は使えなくなります）

## English

### Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:

1. Open this repository's **Security** tab → **Report a vulnerability**
2. Describe the issue, steps to reproduce and impact

You will get a reply after the report is reviewed. Please keep the details private until a fix is released.

### Scope

Fixes go into the latest release. If you run an older version, update it as described in "Updating to a new version" in the README.

- The code in this repository (Cloudflare Worker, translation UI, Notion logging)
- Setup instructions in the README that affect how users handle their secrets

Problems in Soniox, Notion or Cloudflare themselves should be reported to those providers.

### For users

- Keep `SONIOX_API_KEY`, `ACCESS_KEY` and `NOTION_TOKEN` only in Cloudflare secrets, and never include them in issues, chats or screenshots
- If a key may have leaked, regenerate it in Soniox / Notion and replace the value in Cloudflare (and set a new `ACCESS_KEY`)
- If you lose a registered device, set a new `ACCESS_KEY` in Cloudflare (that device stops working)
