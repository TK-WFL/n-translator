// Soniox に渡す「文脈」。聞き取りにくい単語を伝えておくと、その綴りで聞き取るようになる。
// Notion・AI 関連の語は最初から登録しておく（例：Notion が「Ocean」と聞き取られる）

// 製品・サービス名。聞き取り用に伝え、訳すときも英字のまま残す
// （そのままだと Notion→「概念」、Gemini→「双子座」、Copilot→「副操縦士」のように訳されうる）
const PRODUCTS = [
  "Notion",
  "Notion AI",
  "Notion Agent",
  "Notion Calendar",
  "Notion Mail",
  "Notion Sites",
  "Notion Forms",
  "Notion API",
  "Claude",
  "Claude Code",
  "Anthropic",
  "ChatGPT",
  "OpenAI",
  "Gemini",
  "Copilot",
  "Perplexity",
  "NotebookLM",
  "Midjourney",
  "Dify",
  "Zapier",
  "n8n",
];

// 用語。聞き取り用に伝える（訳し方は Soniox に任せる）
const JARGON = [
  "AI",
  "生成AI",
  "AIエージェント",
  "LLM",
  "GPT",
  "RAG",
  "MCP",
  "API",
  "プロンプト",
  "ハルシネーション",
  "ファインチューニング",
  "マルチモーダル",
  "データベース",
  "リレーション",
  "ロールアップ",
  "プロパティ",
  "テンプレート",
  "ワークスペース",
  "チームスペース",
  "同期ブロック",
];

// カタカナで言われた製品名を、訳では英字にそろえる
const KATAKANA = {
  ノーション: "Notion",
  クロード: "Claude",
  クロードコード: "Claude Code",
  アンソロピック: "Anthropic",
  チャットGPT: "ChatGPT",
  ジェミニ: "Gemini",
  コパイロット: "Copilot",
  パープレキシティ: "Perplexity",
  ミッドジャーニー: "Midjourney",
};

export const BUILTIN_TERMS = [...PRODUCTS, ...JARGON];
export const BUILTIN_TRANSLATION_TERMS = [
  ...PRODUCTS.map((name) => ({ source: name, target: name })),
  ...Object.entries(KATAKANA).map(([source, target]) => ({ source, target })),
];

// 「用語」欄：1行に1つ。「日本語 = English」と書くと訳し方も固定する
export function parseTerms(text) {
  const terms = [];
  const translation_terms = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [source, target] = line.split(/\s*=\s*/);
    terms.push(source);
    if (target) translation_terms.push({ source, target });
  }
  return { terms, translation_terms };
}

// 組み込みの用語に「用語」欄の内容を足す。同じ語の訳し方は「用語」欄の指定を優先する
export function buildContext(text) {
  const user = parseTerms(text);
  const overridden = new Set(user.translation_terms.map((t) => t.source));
  return {
    terms: [...new Set([...BUILTIN_TERMS, ...user.terms])],
    translation_terms: [
      ...BUILTIN_TRANSLATION_TERMS.filter((t) => !overridden.has(t.source)),
      ...user.translation_terms,
    ],
  };
}
