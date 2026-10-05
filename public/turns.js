import { maxTurnChars, usesSpaces } from "./languages.js";

// 同じ言語で続く発言（＝同じ人の話）を1つの「ターン」にまとめる。
// Soniox は短い間でも発言を区切るので、そのままだと画面もNotionも細切れになる
export const MERGE_GAP_MS = 12000; // これより長く間が空いたら別のターンにする
// 1ブロックが長くなりすぎないように分ける（文字数の上限は言語ごと。languages.js の maxTurnChars）。
// 発言の途中では切らず、Soniox が区切った発言の単位で次のブロックにする
export const MAX_TURN_MS = 45000; // 話し始めからこれだけ経ったら次のブロックにする

// 空白で区切る言語（英語など）は空白1つで、区切らない言語（日本語・中国語）はそのままつなぐ
export function joinText(parts, lang) {
  const spaced = usesSpaces(lang);
  const text = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(spaced ? " " : "");
  return spaced ? text : tidyCjk(text);
}

// 漢字・かな・全角記号の前後の空白を取る。英単語どうしの空白は残す。
// Soniox の日本語訳は区切れ目に空白が入ることがある（例：「ないのに、 どうやら」）
const CJK = "\\u3000-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef";
const SPACE_AFTER_CJK = new RegExp(`([${CJK}])[ \\t]+`, "g");
const SPACE_BEFORE_CJK = new RegExp(`[ \\t]+([${CJK}])`, "g");

export function tidyCjk(text) {
  return text.replace(SPACE_AFTER_CJK, "$1").replace(SPACE_BEFORE_CJK, "$1");
}

class Turn {
  constructor(id, seg) {
    this.id = id;
    this.segs = [seg];
    this.blockId = null; // Notion に書いたブロック（ログ）
    this.rowId = null; // Notion に書いた表の行（2列）
    this.syncError = null;
    this.queued = false;
  }

  get lang() {
    return this.segs[0].lang;
  }

  // 訳文の言語（Soniox が訳文に付けてくる言語）
  get transLang() {
    return this.segs.find((s) => s.transLang)?.transLang ?? null;
  }

  get startedAt() {
    return this.segs[0].startedAt;
  }

  get last() {
    return this.segs[this.segs.length - 1];
  }

  get orig() {
    return joinText(
      this.segs.map((s) => s.orig),
      this.lang,
    );
  }

  get trans() {
    return joinText(
      this.segs.map((s) => s.trans),
      this.transLang,
    );
  }
}

export class Turns {
  constructor({ gapMs = MERGE_GAP_MS, maxChars = null, maxMs = MAX_TURN_MS } = {}) {
    this.gapMs = gapMs;
    this.maxChars = maxChars; // 数値を渡すと言語によらず同じ上限（テスト用）
    this.maxMs = maxMs;
    this.list = [];
    this._nextId = 1;
  }

  // まだターンに入っていない発言を、直前のターンに足すか新しいターンにする
  assign(segments) {
    for (const seg of segments) {
      if (seg.turn) continue;
      const last = this.list[this.list.length - 1];
      if (last && this.canJoin(last, seg.lang, seg.startedAt)) {
        last.segs.push(seg);
        seg.turn = last;
      } else {
        seg.turn = new Turn(this._nextId++, seg);
        this.list.push(seg.turn);
      }
    }
  }

  canJoin(turn, lang, at) {
    const prev = turn.last;
    const maxChars = this.maxChars ?? maxTurnChars(lang);
    return (
      Boolean(lang) &&
      turn.lang === lang &&
      prev.ended &&
      at - prev.endedAt <= this.gapMs &&
      at - turn.startedAt <= this.maxMs &&
      turn.orig.length < maxChars
    );
  }
}
