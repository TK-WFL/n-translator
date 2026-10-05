import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const ORIGIN = "https://translate.example.workers.dev";
const ASSETS = { fetch: async () => new Response("asset") };
const get = (path, env, key) =>
  worker.fetch(new Request(ORIGIN + path, { headers: key ? { "x-access-key": key } : {} }), { ASSETS, ...env });

test("Worker：ACCESS_KEY がないか短すぎると API を開けない（静的ファイルは出す）", async () => {
  for (const ACCESS_KEY of [undefined, "", "short-key-15char"]) {
    const res = await get("/api/config", { ACCESS_KEY: ACCESS_KEY === "short-key-15char" ? ACCESS_KEY.slice(0, 15) : ACCESS_KEY }, ACCESS_KEY);
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /ACCESS_KEY/);
  }
  assert.equal(await (await get("/", {})).text(), "asset");
});

test("Worker：16文字以上の ACCESS_KEY なら API を使える", async () => {
  const key = "0123456789abcdef";
  assert.equal((await get("/api/config", { ACCESS_KEY: key }, key)).status, 200);
  assert.equal((await get("/api/config", { ACCESS_KEY: key }, "wrong")).status, 401);
});
