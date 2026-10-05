// Soniox のトークン列を「発話」単位（原文＋訳文）にまとめる。
// - 確定トークン（is_final）は発話に積み上げる
// - 未確定トークンは毎メッセージ置き換わるので live に保持するだけ
// - "<end>"（発話の区切り）が来たら、訳文の到着を少し待ってから onSettle を呼ぶ
//   区切り後に訳文が遅れて届いた場合も、もう一度 onSettle が呼ばれる
export class Segmenter {
  constructor({ onChange = () => {}, onSettle = () => {}, settleMs = 1200 } = {}) {
    this.onChange = onChange;
    this.onSettle = onSettle;
    this.settleMs = settleMs;
    this.segments = [];
    this.live = { orig: "", trans: "", lang: null, transLang: null };
    this._nextId = 1;
  }

  get current() {
    return this.segments[this.segments.length - 1];
  }

  handle(msg) {
    const live = { orig: "", trans: "", lang: null, transLang: null };

    for (const t of msg.tokens || []) {
      if (!t.text) continue;
      if (t.text === "<end>") {
        if (t.is_final) this.end();
        continue;
      }

      const isTranslation = t.translation_status === "translation";

      if (!t.is_final) {
        if (isTranslation) {
          live.trans += t.text;
          live.transLang ??= t.language ?? null;
        } else {
          live.orig += t.text;
          live.lang ??= t.language ?? null;
        }
        continue;
      }

      if (isTranslation) {
        // 訳文は直近の発話に付ける（区切り後に遅れて来た分も含む）
        const seg = this.current ?? this._create(null);
        seg.trans += t.text;
        seg.transLang ??= t.language ?? null;
        if (seg.ended) this._schedule(seg);
      } else {
        let seg = this.current;
        if (!seg || seg.ended) seg = this._create(t.language);
        seg.lang ??= t.language ?? null;
        seg.orig += t.text;
      }
    }

    this.live = live;
    this.onChange();
  }

  // 現在の発話を区切る（"<end>" 受信時、接続が切れた時、停止時）
  end() {
    const seg = this.current;
    if (!seg || seg.ended) return;
    seg.ended = true;
    seg.endedAt = new Date();
    this._schedule(seg);
  }

  // 保留中の発話をすべて即座に確定させる
  flush() {
    this.end();
    this.live = { orig: "", trans: "", lang: null, transLang: null };
    for (const seg of this.segments) {
      if (seg.timer) {
        clearTimeout(seg.timer);
        seg.timer = null;
        this.onSettle(seg);
      }
    }
    this.onChange();
  }

  _create(lang) {
    const seg = {
      id: this._nextId++,
      lang: lang ?? null,
      orig: "",
      trans: "",
      ended: false,
      startedAt: new Date(),
      endedAt: null,
      transLang: null, // 訳文の言語
      timer: null,
    };
    this.segments.push(seg);
    return seg;
  }

  _schedule(seg) {
    clearTimeout(seg.timer);
    seg.timer = setTimeout(() => {
      seg.timer = null;
      this.onSettle(seg);
    }, this.settleMs);
  }
}
