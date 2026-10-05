// APIキーなしで画面とNotion連携を試すためのデモ。
// Soniox の WebSocket と同じ形のメッセージを時間差で流す。
// 同じ人が続けて話す場面（2・3行目）も入れて、ターンのまとまり方を確かめられるようにしている
const SCRIPT = [
  { lang: "ja", orig: "今日は来てくれてありがとうございます。", trans: "Thank you for coming today." },
  { lang: "en", orig: "Thanks for having me.", trans: "お招きいただきありがとうございます。" },
  { lang: "en", orig: "I'm excited to see the prototype.", trans: "試作品を見るのが楽しみです。" },
  { lang: "ja", orig: "では、まず全体の流れから説明しますね。", trans: "Well then, let me start by explaining the overall flow." },
  { lang: "en", orig: "Sounds good. How long does the pilot take?", trans: "いいですね。パイロットはどのくらいかかりますか？" },
];

const other = (lang) => (lang === "ja" ? "en" : "ja");

function chunk(text, lang) {
  if (lang === "en") return text.split(/(?=\s)/);
  return text.match(/.{1,3}/gu) ?? [];
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

export class DemoSource {
  constructor({ speed = 1 } = {}) {
    this.speed = speed;
    this.index = 0; // 一時停止しても続きから流す
    this.abort = null;
  }

  // 台本を続きから流す。最後まで流したら黙っている（無音の状態）
  async start(onMessage) {
    this.abort = new AbortController();
    const { signal } = this.abort;
    const wait = (ms) => sleep(ms / this.speed, signal);
    const tok = (text, is_final, status, language) => ({ text, is_final, translation_status: status, language });

    try {
      while (this.index < SCRIPT.length) {
        const line = SCRIPT[this.index];
        const orig = chunk(line.orig, line.lang);
        const trans = chunk(line.trans, other(line.lang));

        // 話している途中：未確定トークンが伸びていく
        for (let i = 1; i <= orig.length; i++) {
          onMessage({ tokens: orig.slice(0, i).map((t) => tok(t, false, "original", line.lang)) });
          await wait(140);
        }
        // 原文が確定
        onMessage({ tokens: orig.map((t) => tok(t, true, "original", line.lang)) });
        this.index++;
        await wait(120);
        // 訳文が少しずつ届く
        for (let i = 0; i < trans.length; i += 2) {
          onMessage({ tokens: trans.slice(i, i + 2).map((t) => tok(t, true, "translation", other(line.lang))) });
          await wait(110);
        }
        onMessage({ tokens: [{ text: "<end>", is_final: true }] });
        await wait(1400);
      }
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    }
  }

  stop() {
    this.abort?.abort();
  }
}
