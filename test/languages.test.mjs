import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, isLanguage, language, languageLabel, maxTurnChars, usesSpaces } from "../public/languages.js";

test("Soniox の60言語がそろっていて、コードの重複がない", () => {
  assert.equal(LANGUAGES.length, 60);
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, 60);
  for (const code of ["ja", "en", "zh", "ko", "es", "fr", "de", "vi", "th", "ar", "tl", "no", "cy"]) assert.ok(isLanguage(code), code);
  assert.equal(isLanguage("xx"), false);
});

test("表示名・旗・つなぎ方・1ブロックの長さ", () => {
  assert.equal(languageLabel("ja"), "🇯🇵 日本語");
  assert.equal(languageLabel("zh"), "🇨🇳 中国語（中文）");
  assert.equal(language("xx").flag, "💬");
  assert.equal(usesSpaces("ja"), false);
  assert.equal(usesSpaces("zh"), false);
  assert.equal(usesSpaces("en"), true);
  assert.equal(usesSpaces("ko"), true);
  assert.equal(maxTurnChars("ja"), 120);
  assert.equal(maxTurnChars("fr"), 280);
});
