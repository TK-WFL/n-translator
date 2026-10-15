import test from "node:test";
import assert from "node:assert/strict";
import { isPermanentSonioxError, sonioxErrorMessage } from "../public/soniox-errors.js";

test("Soniox のエラー：キー・残高・上限・設定の誤りはつなぎ直さず、タイムアウトと Soniox 側の不調はつなぎ直す", () => {
  for (const code of [400, 401, 402, 403, 429]) assert.equal(isPermanentSonioxError(code), true, String(code));
  for (const code of [408, 500, 502, 503, NaN, undefined]) assert.equal(isPermanentSonioxError(code), false, String(code));
});

test("Soniox のエラー：何を確かめればよいかをメッセージに入れる", () => {
  assert.match(sonioxErrorMessage(401, "Invalid API key"), /API キーが使えません（Soniox 401: Invalid API key）.*SONIOX_API_KEY/);
  assert.match(sonioxErrorMessage(403), /API キーが使えません（Soniox 403）/);
  assert.match(sonioxErrorMessage(402, "Insufficient balance"), /残高が足りません.*残高・支払い方法/);
  assert.match(sonioxErrorMessage(429), /利用の上限/);
  assert.equal(sonioxErrorMessage(400, "Invalid config"), "Soniox でエラーが起きました（Soniox 400: Invalid config）。");
});
