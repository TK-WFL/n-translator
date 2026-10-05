import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_TERMS, buildContext, parseTerms } from "../public/context.js";

const keep = (ctx, name) => ctx.translation_terms.find((t) => t.source === name)?.target;

test("用語欄が空でも Notion・AI 関連の語を最初から伝える", () => {
  const ctx = buildContext("");
  for (const word of ["Notion", "Notion AI", "Claude", "ChatGPT", "Gemini", "生成AI", "ハルシネーション", "リレーション"]) {
    assert.ok(ctx.terms.includes(word), word);
  }
  assert.equal(new Set(ctx.terms).size, ctx.terms.length); // 重複なし
});

test("製品名は訳しても英字のまま残し、カタカナは英字にそろえる", () => {
  const ctx = buildContext("");
  assert.equal(keep(ctx, "Notion"), "Notion");
  assert.equal(keep(ctx, "Gemini"), "Gemini");
  assert.equal(keep(ctx, "Copilot"), "Copilot");
  assert.equal(keep(ctx, "ノーション"), "Notion");
  assert.equal(keep(ctx, "クロード"), "Claude");
  assert.equal(keep(ctx, "生成AI"), undefined); // 用語の訳し方は Soniox に任せる
});

test("用語欄の内容を足す（重複は1つに）", () => {
  const ctx = buildContext("山田\nNotion\n議事録 = meeting minutes\n");
  assert.deepEqual(ctx.terms.slice(BUILTIN_TERMS.length), ["山田", "議事録"]);
  assert.deepEqual(ctx.translation_terms.at(-1), { source: "議事録", target: "meeting minutes" });
});

test("同じ語の訳し方は用語欄の指定を優先する", () => {
  const ctx = buildContext("ノーション = Notion app");
  assert.equal(ctx.translation_terms.filter((t) => t.source === "ノーション").length, 1);
  assert.equal(keep(ctx, "ノーション"), "Notion app");
});

test("用語欄の書き方を読み取る", () => {
  assert.deepEqual(parseTerms("  A  \n\nB = b"), { terms: ["A", "B"], translation_terms: [{ source: "B", target: "b" }] });
});

test("Soniox の文脈の上限（約1万文字）に十分おさまる", () => {
  assert.ok(JSON.stringify(buildContext("")).length < 3000);
});
