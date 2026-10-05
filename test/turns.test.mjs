import test from "node:test";
import assert from "node:assert/strict";
import { Turns, joinText } from "../public/turns.js";

const t0 = new Date("2026-09-29T05:00:00Z").getTime();
const seg = (id, lang, orig, trans, startSec, endSec, transLang = lang === "en" ? "ja" : "en") => ({
  id,
  lang,
  orig,
  trans,
  transLang,
  startedAt: new Date(t0 + startSec * 1000),
  endedAt: endSec == null ? null : new Date(t0 + endSec * 1000),
  ended: endSec != null,
});

test("日本語はそのまま、英語は空白でつなぐ", () => {
  assert.equal(joinText(["今日は", " 晴れです。"], "ja"), "今日は晴れです。");
  assert.equal(joinText(["Hello.", " How are you?"], "en"), "Hello. How are you?");
});

test("同じ言語で間を空けずに続いた発言は1つのターンになる", () => {
  const turns = new Turns();
  const segs = [
    seg(1, "en", "Thanks for having me.", "お招きいただきありがとうございます。", 0, 2),
    seg(2, "en", " I'm excited.", "楽しみです。", 3, 4),
    seg(3, "ja", "では説明します。", "Let me explain.", 5, 6),
  ];
  turns.assign(segs);
  assert.equal(turns.list.length, 2);
  assert.equal(turns.list[0].orig, "Thanks for having me. I'm excited.");
  assert.equal(turns.list[0].trans, "お招きいただきありがとうございます。楽しみです。");
  assert.equal(turns.list[1].lang, "ja");
  assert.equal(segs[1].turn, turns.list[0]);
});

test("間が長く空いたとき・長くなりすぎたときは別のターンにする", () => {
  const turns = new Turns({ gapMs: 12000, maxChars: 20 });
  turns.assign([seg(1, "ja", "はい。", "Yes.", 0, 1), seg(2, "ja", "そうですね。", "I see.", 20, 21)]);
  assert.equal(turns.list.length, 2); // 19秒空いた

  const long = new Turns({ gapMs: 12000, maxChars: 20 });
  long.assign([seg(1, "ja", "あ".repeat(25), "A", 0, 1), seg(2, "ja", "続き", "more", 2, 3)]);
  assert.equal(long.list.length, 2);
});

test("まだ話している途中（区切り前）の発言には次の発言を足さない", () => {
  const turns = new Turns();
  const first = seg(1, "ja", "えっと", "", 0, null);
  turns.assign([first]);
  assert.equal(turns.canJoin(turns.list[0], "ja", new Date(t0 + 1000)), false);
});

test("日本語・中国語の文字の前後の空白を取る（英単語どうしの空白は残す）", async () => {
  const { tidyCjk } = await import("../public/turns.js");
  assert.equal(tidyCjk("ないのに、 どうやら すごく才能がある らしい。"), "ないのに、どうやらすごく才能があるらしい。");
  assert.equal(tidyCjk("これは Notion AI の 機能です"), "これはNotion AIの機能です");
  assert.equal(joinText(["你好，", " 欢迎。"], "zh"), "你好，欢迎。");
  assert.equal(joinText(["안녕하세요.", "반갑습니다."], "ko"), "안녕하세요. 반갑습니다.");
  assert.equal(joinText(["経験がないのに、", " どうやら才能がある。"], "ja"), "経験がないのに、どうやら才能がある。");
  assert.equal(joinText(["Hello there", "friend"], "en"), "Hello there friend");
});

test("1ブロックの長さ：言語ごとの文字数を超えたら次のブロックにする", () => {
  const turns = new Turns();
  const en = "This is a fairly long English sentence that keeps going on and on. "; // 68文字
  const segs = [0, 1, 2, 3, 4, 5].map((i) => seg(i + 1, "en", en, "訳", i * 3, i * 3 + 2));
  turns.assign(segs);
  // 280文字に届くまで（4文 = 272文字）つなぎ、5文目から次のブロック
  assert.deepEqual(turns.list.map((t) => t.segs.length), [5, 1]);

  const ja = new Turns();
  const jaSeg = "あ".repeat(50);
  ja.assign([0, 1, 2, 3].map((i) => seg(i + 1, "ja", jaSeg, "A", i * 3, i * 3 + 2)));
  // 120文字に届くまで（50+50=100 → 3つ目を足して150）、4つ目から次
  assert.deepEqual(ja.list.map((t) => t.segs.length), [3, 1]);
});

test("1ブロックの長さ：話し始めから45秒を過ぎたら次のブロックにする", () => {
  const turns = new Turns({ maxChars: 10000 });
  const segs = [0, 10, 20, 30, 40, 50].map((sec, i) => seg(i + 1, "en", "Short.", "短い。", sec, sec + 8));
  turns.assign(segs);
  // 0〜40秒に始まった発言は1つ目、50秒のものは次
  assert.deepEqual(turns.list.map((t) => t.segs.length), [5, 1]);
});

test("訳文は Soniox が付けた訳文の言語でつなぐ（中国語の発言 → 日本語訳は空白なし）", () => {
  const turns = new Turns();
  turns.assign([seg(1, "zh", "你好。", "こんにちは。", 0, 1, "ja"), seg(2, "zh", "欢迎。", " ようこそ。", 2, 3, "ja")]);
  assert.equal(turns.list.length, 1);
  assert.equal(turns.list[0].orig, "你好。欢迎。");
  assert.equal(turns.list[0].trans, "こんにちは。ようこそ。");
  assert.equal(turns.list[0].transLang, "ja");
});
