// Soniox が聞き取り・翻訳できる言語（code は Soniox の言語コード。どの2言語の組み合わせでも双方向に訳せる）。
// name：選ぶときの名前、native：その言語での名前、flag：表示用の旗、common：一覧の上に出す
// 画面（public/app.js）とサーバー（lib/api.js）の両方から使う
export const LANGUAGES = [
  { code: "ja", name: "日本語", native: "日本語", flag: "🇯🇵", common: true },
  { code: "en", name: "英語", native: "English", flag: "🇺🇸", common: true },
  { code: "zh", name: "中国語", native: "中文", flag: "🇨🇳", common: true },
  { code: "ko", name: "韓国語", native: "한국어", flag: "🇰🇷", common: true },
  { code: "es", name: "スペイン語", native: "Español", flag: "🇪🇸", common: true },
  { code: "fr", name: "フランス語", native: "Français", flag: "🇫🇷", common: true },
  { code: "de", name: "ドイツ語", native: "Deutsch", flag: "🇩🇪", common: true },
  { code: "it", name: "イタリア語", native: "Italiano", flag: "🇮🇹", common: true },
  { code: "pt", name: "ポルトガル語", native: "Português", flag: "🇧🇷", common: true },
  { code: "ru", name: "ロシア語", native: "Русский", flag: "🇷🇺", common: true },
  { code: "vi", name: "ベトナム語", native: "Tiếng Việt", flag: "🇻🇳", common: true },
  { code: "th", name: "タイ語", native: "ไทย", flag: "🇹🇭", common: true },
  { code: "id", name: "インドネシア語", native: "Bahasa Indonesia", flag: "🇮🇩", common: true },
  { code: "ms", name: "マレー語", native: "Bahasa Melayu", flag: "🇲🇾", common: true },
  { code: "tl", name: "タガログ語", native: "Tagalog", flag: "🇵🇭", common: true },
  { code: "hi", name: "ヒンディー語", native: "हिन्दी", flag: "🇮🇳", common: true },
  { code: "ar", name: "アラビア語", native: "العربية", flag: "🇸🇦", common: true },
  { code: "tr", name: "トルコ語", native: "Türkçe", flag: "🇹🇷", common: true },
  { code: "af", name: "アフリカーンス語", native: "Afrikaans", flag: "🇿🇦" },
  { code: "sq", name: "アルバニア語", native: "Shqip", flag: "🇦🇱" },
  { code: "az", name: "アゼルバイジャン語", native: "Azərbaycanca", flag: "🇦🇿" },
  { code: "eu", name: "バスク語", native: "Euskara", flag: "🌐" },
  { code: "be", name: "ベラルーシ語", native: "Беларуская", flag: "🇧🇾" },
  { code: "bn", name: "ベンガル語", native: "বাংলা", flag: "🇧🇩" },
  { code: "bs", name: "ボスニア語", native: "Bosanski", flag: "🇧🇦" },
  { code: "bg", name: "ブルガリア語", native: "Български", flag: "🇧🇬" },
  { code: "ca", name: "カタルーニャ語", native: "Català", flag: "🌐" },
  { code: "hr", name: "クロアチア語", native: "Hrvatski", flag: "🇭🇷" },
  { code: "cs", name: "チェコ語", native: "Čeština", flag: "🇨🇿" },
  { code: "da", name: "デンマーク語", native: "Dansk", flag: "🇩🇰" },
  { code: "nl", name: "オランダ語", native: "Nederlands", flag: "🇳🇱" },
  { code: "et", name: "エストニア語", native: "Eesti", flag: "🇪🇪" },
  { code: "fi", name: "フィンランド語", native: "Suomi", flag: "🇫🇮" },
  { code: "gl", name: "ガリシア語", native: "Galego", flag: "🌐" },
  { code: "el", name: "ギリシャ語", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "gu", name: "グジャラート語", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "he", name: "ヘブライ語", native: "עברית", flag: "🇮🇱" },
  { code: "hu", name: "ハンガリー語", native: "Magyar", flag: "🇭🇺" },
  { code: "kn", name: "カンナダ語", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "kk", name: "カザフ語", native: "Қазақ тілі", flag: "🇰🇿" },
  { code: "lv", name: "ラトビア語", native: "Latviešu", flag: "🇱🇻" },
  { code: "lt", name: "リトアニア語", native: "Lietuvių", flag: "🇱🇹" },
  { code: "mk", name: "マケドニア語", native: "Македонски", flag: "🇲🇰" },
  { code: "ml", name: "マラヤーラム語", native: "മലയാളം", flag: "🇮🇳" },
  { code: "mr", name: "マラーティー語", native: "मराठी", flag: "🇮🇳" },
  { code: "no", name: "ノルウェー語", native: "Norsk", flag: "🇳🇴" },
  { code: "fa", name: "ペルシャ語", native: "فارسی", flag: "🇮🇷" },
  { code: "pl", name: "ポーランド語", native: "Polski", flag: "🇵🇱" },
  { code: "pa", name: "パンジャーブ語", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "ro", name: "ルーマニア語", native: "Română", flag: "🇷🇴" },
  { code: "sr", name: "セルビア語", native: "Српски", flag: "🇷🇸" },
  { code: "sk", name: "スロバキア語", native: "Slovenčina", flag: "🇸🇰" },
  { code: "sl", name: "スロベニア語", native: "Slovenščina", flag: "🇸🇮" },
  { code: "sw", name: "スワヒリ語", native: "Kiswahili", flag: "🇰🇪" },
  { code: "sv", name: "スウェーデン語", native: "Svenska", flag: "🇸🇪" },
  { code: "ta", name: "タミル語", native: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "テルグ語", native: "తెలుగు", flag: "🇮🇳" },
  { code: "uk", name: "ウクライナ語", native: "Українська", flag: "🇺🇦" },
  { code: "ur", name: "ウルドゥー語", native: "اردو", flag: "🇵🇰" },
  { code: "cy", name: "ウェールズ語", native: "Cymraeg", flag: "🌐" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const isLanguage = (code) => BY_CODE.has(code);

export const language = (code) => BY_CODE.get(code) ?? { code, name: code ?? "?", native: code ?? "?", flag: "💬" };

// 選ぶときの表示（例：🇨🇳 中国語（中文））
export const languageLabel = (code) => {
  const l = language(code);
  return l.name === l.native ? `${l.flag} ${l.name}` : `${l.flag} ${l.name}（${l.native}）`;
};

// 相手が選ぶときの表示：その言語での名前に、相手の言語（いま選んでいる言語）での名前を添える
// （例：相手が英語なら「🇪🇸 Español (Spanish)」、中国語なら「🇪🇸 Español（西班牙语）」）。
// 名前が分からない環境では日本語の名前を添える
const displayNames = new Map();
const WIDE_PARENS = new Set(["ja", "zh"]);

export function nativeLabel(code, viewer) {
  const l = language(code);
  let local = l.name;
  try {
    if (!displayNames.has(viewer)) displayNames.set(viewer, new Intl.DisplayNames([viewer], { type: "language" }));
    const name = displayNames.get(viewer).of(code);
    if (name && name !== code) local = name;
  } catch {}
  if (local.toLowerCase() === l.native.toLowerCase()) return `${l.flag} ${l.native}`;
  return WIDE_PARENS.has(viewer) ? `${l.flag} ${l.native}（${local}）` : `${l.flag} ${l.native} (${local})`;
}

// 単語を空白で区切らない言語。発言をつなぐときに空白を入れず、余計な空白も取る
const NO_SPACE = new Set(["ja", "zh"]);
export const usesSpaces = (code) => !NO_SPACE.has(code);

// 1ブロックの長さの上限（文字数・およそ20秒分）。漢字・かな・ハングルは1文字の情報量が多いので短め
const TURN_CHARS = { ja: 120, zh: 100, ko: 150 };
export const maxTurnChars = (code) => TURN_CHARS[code] ?? 280;
