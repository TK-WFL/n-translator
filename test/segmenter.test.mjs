import test from "node:test";
import assert from "node:assert/strict";
import { Segmenter } from "../public/segmenter.js";
import { DemoSource } from "../public/demo.js";

const tok = (text, is_final, translation_status = "original", language = "ja") => ({ text, is_final, translation_status, language });

test("未確定トークンは live にだけ入り、確定で発話になる", () => {
  const s = new Segmenter({ settleMs: 0 });
  s.handle({ tokens: [tok("こんに", false), tok("ちは", false)] });
  assert.equal(s.segments.length, 0);
  assert.equal(s.live.orig, "こんにちは");
  s.handle({ tokens: [tok("こんにちは", true)] });
  assert.equal(s.segments.length, 1);
  assert.equal(s.segments[0].orig, "こんにちは");
  assert.equal(s.live.orig, "");
});

test("<end> で区切られ、区切った時刻が記録され、次の原文は新しい発話になる", async () => {
  const settled = [];
  const s = new Segmenter({ settleMs: 5, onSettle: (x) => settled.push({ id: x.id, trans: x.trans }) });
  s.handle({ tokens: [tok("はい", true), tok("Yes", true, "translation", "en"), { text: "<end>", is_final: true }] });
  assert.ok(s.segments[0].endedAt instanceof Date);
  assert.equal(s.segments[0].transLang, "en"); // 訳文の言語を覚えておく
  s.handle({ tokens: [tok(" OK", true, "original", "en")] });
  assert.equal(s.segments.length, 2);
  assert.equal(s.segments[0].lang, "ja");
  assert.equal(s.segments[1].lang, "en");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(settled, [{ id: 1, trans: "Yes" }]);
});

test("<end> の後に遅れて届いた訳文も同じ発話に入り、もう一度 settle される", async () => {
  const settled = [];
  const s = new Segmenter({ settleMs: 5, onSettle: (x) => settled.push(x.trans) });
  s.handle({ tokens: [tok("ありがとう", true), { text: "<end>", is_final: true }] });
  await new Promise((r) => setTimeout(r, 20));
  s.handle({ tokens: [tok("Thank", true, "translation", "en"), tok(" you", true, "translation", "en")] });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(s.segments.length, 1);
  assert.deepEqual(settled, ["", "Thank you"]);
});

test("flush で保留中の発話が即座に確定する", () => {
  const settled = [];
  const s = new Segmenter({ settleMs: 10_000, onSettle: (x) => settled.push(x.orig) });
  s.handle({ tokens: [tok("途中", true)] });
  s.flush();
  assert.deepEqual(settled, ["途中"]);
  assert.equal(s.segments[0].ended, true);
});

test("デモの台本が原文と訳文のペアに分かれ、一時停止しても続きから流れる", async () => {
  const s = new Segmenter({ settleMs: 1 });
  const demo = new DemoSource({ speed: 50 });
  const running = demo.start((m) => s.handle(m));
  await new Promise((r) => setTimeout(r, 30));
  demo.stop(); // 途中で一時停止
  await running;
  await demo.start((m) => s.handle(m)); // 再開して最後まで
  s.flush();
  const rows = s.segments.map((x) => [x.lang, x.orig, x.trans]);
  assert.deepEqual(rows.at(-1), ["en", "Sounds good. How long does the pilot take?", "いいですね。パイロットはどのくらいかかりますか？"]);
  assert.deepEqual(rows.slice(0, 3), [
    ["ja", "今日は来てくれてありがとうございます。", "Thank you for coming today."],
    ["en", "Thanks for having me.", "お招きいただきありがとうございます。"],
    ["en", "I'm excited to see the prototype.", "試作品を見るのが楽しみです。"],
  ]);
  assert.equal(new Set(rows.map((r) => r[1])).size, rows.length); // 同じ行が二重に入らない
});
