import test from "node:test";
import assert from "node:assert/strict";
import { handleApi, extractNotionId, resetNotionCache, signId } from "../lib/api.js";

const ORIGIN = "https://translate.example.workers.dev";
const PARENT = "0123456789abcdef0123456789abcdef";
const PAGE = "11111111-2222-3333-4444-555555555555";
const BLOCK = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const uuid = (c) => `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
const TAB = uuid("1");
const LOG = uuid("2");
const PANE = uuid("3");
const TABLE = uuid("4");
const ROW = uuid("5");
const HEADING = uuid("6");
const env = {
  SONIOX_API_KEY: "sx",
  NOTION_TOKEN: "secret",
  NOTION_PARENT_PAGE: `https://www.notion.so/ws/Logs-${PARENT}?pvs=4`,
  ACCESS_KEY: "k123",
};
const opts = { allowedOrigins: [ORIGIN] };
// ブラウザとやりとりする ID は「ID.署名」の形
const S = Object.fromEntries(
  await Promise.all(Object.entries({ PAGE, BLOCK, LOG, TABLE, ROW }).map(async ([k, id]) => [k, await signId(env, id)])),
);
const DEFAULT_PROPS = {
  名前: { type: "title" },
  日時: { type: "date" },
  "長さ（分）": { type: "number" },
  発言数: { type: "number" },
  相手: { type: "select" },
  要約: { type: "rich_text" },
};

function req(path, { method = "POST", body = {}, key = "k123", origin = ORIGIN, type = "application/json" } = {}) {
  const headers = { "content-type": type, origin };
  if (key !== null) headers["x-access-key"] = key;
  return new Request(ORIGIN + path, { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
}

const call = async (path, body) => handleApi(req(path, { body }), env, opts);

// fetch を差し替えて Notion / Soniox への送信内容を記録する
function mockFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const c = { url: String(url), path: new URL(url).pathname.replace(/^\/v1/, ""), method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) };
    calls.push(c);
    const [status, body, headers] = handler(c, calls.length);
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

// Notion の必要な部分だけの偽物
const CREATED = { tab: TAB, heading_3: HEADING, table: TABLE, callout: BLOCK, table_row: ROW, embed: uuid("7") };

function fakeNotion({ db = null, props = DEFAULT_PROPS, override } = {}) {
  let dbId = db;
  return (c, n) => {
    const hit = override?.(c, n);
    if (hit) return hit;
    if (c.method === "GET" && c.path === "/users/me") return [200, { object: "user", type: "bot", bot: {} }];
    if (c.method === "GET" && c.path.startsWith(`/blocks/${TAB}/children`)) {
      return [200, { results: [{ id: LOG, type: "paragraph" }, { id: PANE, type: "paragraph" }], has_more: false }];
    }
    if (c.method === "GET" && c.path.endsWith("/children")) {
      const results = [{ id: "p1", type: "paragraph" }];
      if (dbId) results.push({ id: dbId, type: "child_database", child_database: { title: "翻訳ログ" } });
      return [200, { results, has_more: false }];
    }
    if (c.method === "POST" && c.path === "/databases") {
      dbId = "db-new";
      return [200, { id: dbId }];
    }
    if (c.method === "GET" && c.path.startsWith("/databases/")) return [200, { properties: props }];
    if (c.method === "POST" && c.path === "/pages") return [200, { id: PAGE, url: "https://www.notion.so/page" }];
    if (c.method === "PATCH" && c.path.endsWith("/children")) {
      return [200, { results: [{ id: CREATED[c.body.children[0].type] }] }];
    }
    return [200, { id: "ok" }];
  };
}

const pathOf = (c) => `${c.method} ${c.path.split("?")[0]}`;

async function withNotion(options, fn) {
  resetNotionCache();
  const m = mockFetch(fakeNotion(options));
  try {
    await fn(m.calls);
  } finally {
    m.restore();
  }
}

test("URLからNotionのページIDを取り出す", () => {
  assert.equal(extractNotionId(env.NOTION_PARENT_PAGE), PARENT);
  assert.equal(extractNotionId("01234567-89ab-cdef-0123-456789abcdef"), "0123456789abcdef0123456789abcdef");
  assert.equal(extractNotionId(""), "");
});

test("/api 以外は null（静的ファイルに回す）", async () => {
  assert.equal(await handleApi(new Request(ORIGIN + "/app.js"), env, opts), null);
});

test("アクセスキー・Origin・Content-Type を検査する", async () => {
  assert.equal((await handleApi(req("/api/config", { method: "GET", key: null }), env, opts)).status, 401);
  assert.equal((await handleApi(req("/api/config", { method: "GET", key: "wrong" }), env, opts)).status, 401);
  assert.equal((await handleApi(req("/api/config", { method: "GET", origin: "https://evil.example" }), env, opts)).status, 403);
  assert.equal((await handleApi(req("/api/notion/session", { type: "text/plain" }), env, opts)).status, 415);
  const ok = await handleApi(req("/api/config", { method: "GET" }), env, opts);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { soniox: true, notion: true });
});

test("Soniox の一時キーを発行する", async () => {
  const m = mockFetch(() => [201, { api_key: "temp", expires_at: "x" }]);
  try {
    const res = await call("/api/soniox-key", {});
    assert.deepEqual(await res.json(), { api_key: "temp" });
    assert.equal(m.calls[0].url, "https://api.soniox.com/v1/auth/temporary-api-key");
    assert.equal(m.calls[0].headers.Authorization, "Bearer sx");
    assert.equal(m.calls[0].body.usage_type, "transcribe_websocket");
    assert.equal(m.calls[0].body.single_use, true);
    assert.equal(m.calls[0].body.expires_in_seconds, 60);
    assert.equal(m.calls[0].body.max_session_duration_seconds, 3 * 60 * 60);
  } finally {
    m.restore();
  }
});

test("会話の開始：既存の「翻訳ログ」に1行追加する（2回目は探し直さない）", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    const res = await call("/api/notion/session", { title: "会話 9/29 14:03", startedAt: "2026-09-29T05:03:00.000Z" });
    assert.deepEqual(await res.json(), { pageId: S.PAGE, url: "https://www.notion.so/page", logId: S.LOG, tableId: S.TABLE });
    assert.deepEqual(calls.map(pathOf).slice(0, 3), [`GET /blocks/${PARENT}/children`, "GET /databases/db-1", "POST /pages"]);
    const page = calls[2].body;
    assert.deepEqual(page.parent, { database_id: "db-1" });
    assert.deepEqual(page.properties.名前.title[0].text.content, "会話 9/29 14:03");
    assert.deepEqual(page.properties.日時, { date: { start: "2026-09-29T05:03:00.000Z" } });
    assert.deepEqual(page.properties.発言数, { number: 0 });

    const before = calls.length;
    await call("/api/notion/session", { title: "次の会話" });
    assert.equal(calls[before].path, "/pages"); // 2回目はデータベースを探し直さない
  }));

test("会話ページの中身：「ログ」「2列（対訳）」のタブと、時刻｜日本語｜English の表を作る", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    await call("/api/notion/session", { title: "会話" });
    assert.deepEqual(calls.map(pathOf).slice(3), [
      `PATCH /blocks/${PAGE}/children`,
      `GET /blocks/${TAB}/children`,
      `PATCH /blocks/${PANE}/children`,
    ]);
    const tabs = calls[3].body.children[0].tab.children.map((p) => [p.paragraph.rich_text[0].text.content, p.paragraph.icon.emoji]);
    assert.deepEqual(tabs, [["ログ", "💬"], ["2列（対訳）", "📖"]]);
    const table = calls[5].body.children[0].table;
    assert.equal(table.table_width, 3);
    assert.equal(table.has_column_header, true);
    assert.deepEqual(table.children[0].table_row.cells.map((c) => c[0].text.content), ["時刻", "🇯🇵 日本語", "🇺🇸 英語"]);
  }));

test("会話ページの中身：タブを作れないときは、表を折りたたみ見出しに入れ、ログはページ直下にする", () =>
  withNotion(
    { db: "db-1", override: (c) => (c.body?.children?.[0]?.type === "tab" ? [400, { message: "unsupported block" }] : null) },
    async (calls) => {
      const res = await (await call("/api/notion/session", { title: "会話" })).json();
      assert.deepEqual(res, { pageId: S.PAGE, url: "https://www.notion.so/page", logId: null, tableId: S.TABLE });
      const heading = calls.find((c) => c.body?.children?.[0]?.type === "heading_3").body.children[0].heading_3;
      assert.equal(heading.is_toggleable, true);
      assert.ok(calls.some((c) => pathOf(c) === `PATCH /blocks/${HEADING}/children`));
    },
  ));

test("会話ページの中身：枠を作れなくても会話の記録は始められる", () =>
  withNotion(
    { db: "db-1", override: (c) => (c.body?.children?.[0]?.type === "table" ? [400, { message: "bad table" }] : null) },
    async () => {
      const res = await call("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { pageId: S.PAGE, url: "https://www.notion.so/page", logId: null, tableId: null });
    },
  ));

test("会話の開始：「翻訳ログ」がなければページ内に表として作る", () =>
  withNotion({}, async (calls) => {
    await call("/api/notion/session", { title: "会話" });
    const create = calls.find((c) => c.path === "/databases");
    assert.deepEqual(create.body.parent, { type: "page_id", page_id: PARENT });
    assert.equal(create.body.is_inline, true);
    assert.equal(create.body.title[0].text.content, "翻訳ログ");
    assert.deepEqual(Object.keys(create.body.properties), ["名前", "日時", "長さ（分）", "発言数", "相手", "要約"]);
    assert.deepEqual(calls.find((c) => c.path === "/pages").body.parent, { database_id: "db-new" });
  }));

test("会話の開始：列の名前が変えられていても止まらない", () =>
  withNotion({ db: "db-1", props: { タイトル: { type: "title" }, 日付: { type: "date" } } }, async (calls) => {
    const res = await call("/api/notion/session", { title: "会話", startedAt: "2026-09-29T05:03:00.000Z" });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(calls.find((c) => c.path === "/pages").body.properties), ["タイトル"]);
  }));

test("会話の開始：データベースが消されていたら探し直してやり直す", () =>
  withNotion(
    {
      db: "db-1",
      // 覚えていた db-1 が消されている想定：最初のページ作成だけ 404
      override: (c, n) => (c.path === "/pages" && n === 3 ? [404, { message: "Could not find database" }] : null),
    },
    async (calls) => {
      const res = await call("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 200);
      assert.equal(calls.filter((c) => c.path === "/pages").length, 2);
      assert.equal(calls.filter((c) => pathOf(c) === `GET /blocks/${PARENT}/children`).length, 2);
    },
  ));

test("一時停止・終了：長さと発言数を書き込む。IDの形式も確かめる", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    const res = await call("/api/notion/session/update", { pageId: S.PAGE, minutes: 12.5, count: 8 });
    assert.deepEqual(await res.json(), { ok: true });
    const patch = calls.at(-1);
    assert.equal(patch.method, "PATCH");
    assert.equal(patch.path, `/pages/${PAGE}`);
    assert.deepEqual(patch.body.properties, { "長さ（分）": { number: 12.5 }, 発言数: { number: 8 } });

    const bad = await call("/api/notion/session/update", { pageId: "../users", minutes: 1, count: 1 });
    assert.equal(bad.status, 400);
  }));

test("署名のない ID・ほかの ID の署名・署名の付け替えは受け付けない（アプリが作ったブロック以外は書き換えない）", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    const other = uuid("f");
    const sig = (signed) => signed.split(".")[1];
    for (const pageId of [PAGE, other, `${other}.${sig(S.PAGE)}`, `${S.PAGE}.x`, `${PAGE}.`]) {
      const res = await call("/api/notion/session/update", { pageId, minutes: 1, count: 1 });
      assert.equal(res.status, 403, pageId);
    }
    const u = { pageId: S.LOG, lang: "ja", orig: "はい", trans: "", time: "", primary: "ja" };
    for (const extra of [{ blockId: BLOCK }, { blockId: `${other}.${sig(S.BLOCK)}` }, { tableId: TABLE }, { rowId: ROW }, { pageId: LOG }]) {
      const res = await call("/api/notion/utterance", { ...u, ...extra });
      assert.equal(res.status, 403, JSON.stringify(extra));
    }
    // 別の環境（キーが違う）で作った署名も通らない
    const foreign = await signId({ ...env, ACCESS_KEY: "another-key-0000" }, PAGE);
    assert.equal((await call("/api/notion/session/update", { pageId: foreign, minutes: 1, count: 1 })).status, 403);
    assert.equal(calls.filter((c) => c.method !== "GET").length, 0); // Notion には何も書いていない
  }));

test("発言：話した言葉を本文に、訳を灰色で添える（429は再試行）", () =>
  withNotion(
    { override: (c, n) => (n === 1 ? [429, { message: "slow down" }, { "retry-after": "0" }] : null) },
    async (calls) => {
      const mine = { pageId: S.PAGE, lang: "ja", orig: "こんにちは", trans: "Hello", time: "10:00:00", primary: "ja" };
      assert.deepEqual(await (await call("/api/notion/utterance", mine)).json(), { blockId: S.BLOCK, rowId: null }); // 表なし
      assert.equal(calls.length, 2); // 429 → 再送
      const a = calls[1].body.children[0].callout;
      assert.deepEqual(
        a.rich_text.map((r) => [r.text.content, r.annotations.color ?? null]),
        [["10:00:00  ", "gray"], ["こんにちは", null], ["\nHello", "gray"]],
      );
      assert.equal(a.icon.emoji, "🇯🇵");
      assert.equal(a.color, "gray_background");

      // 相手（英語）の発言も、話した言葉（英語）を本文にして、背景を青にする
      const theirs = { pageId: S.PAGE, lang: "en", orig: "Nice to meet you.", trans: "はじめまして。", time: "10:00:05", primary: "ja" };
      await call("/api/notion/utterance", theirs);
      const b = calls.at(-1).body.children[0].callout;
      assert.equal(b.rich_text.map((r) => r.text.content).join(""), "10:00:05  Nice to meet you.\nはじめまして。");
      assert.equal(b.color, "blue_background");

      // 発言が続いたら同じブロックを更新する
      await call("/api/notion/utterance", { ...theirs, blockId: S.BLOCK, trans: "はじめまして。よろしく。" });
      assert.equal(calls.at(-1).method, "PATCH");
      assert.equal(calls.at(-1).path, `/blocks/${BLOCK}`);
    },
  ));

test("発言：絵文字アイコンが弾かれたらアイコンなしで再送", async () => {
  resetNotionCache();
  const m = mockFetch((c) =>
    c.body.children[0].callout.icon ? [400, { message: "bad emoji" }] : [200, { results: [{ id: BLOCK }] }],
  );
  try {
    const res = await call("/api/notion/utterance", { pageId: S.PAGE, lang: "en", orig: "Hi", trans: "やあ", time: "" });
    assert.deepEqual(await res.json(), { blockId: S.BLOCK, rowId: null });
    assert.equal(m.calls.length, 2);
    assert.equal(m.calls[1].body.children[0].callout.icon, undefined);
  } finally {
    m.restore();
  }
});

test("Notion のエラーは 502 として返す", async () => {
  resetNotionCache();
  const m = mockFetch(() => [401, { message: "API token is invalid." }]);
  try {
    const res = await call("/api/notion/session", {});
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /Notion 401/);
  } finally {
    m.restore();
  }
});

test("発言：ログのコールアウトと2列の表の行を書き、2回目以降は同じ行を更新する", () =>
  withNotion({}, async (calls) => {
    const u = { pageId: S.LOG, tableId: S.TABLE, lang: "en", orig: "Nice to meet you.", trans: "はじめまして。", time: "10:00:05", primary: "ja" };
    const first = await (await call("/api/notion/utterance", u)).json();
    assert.deepEqual(first, { blockId: S.BLOCK, rowId: S.ROW });
    assert.deepEqual(calls.map(pathOf), [`PATCH /blocks/${LOG}/children`, `PATCH /blocks/${TABLE}/children`]);
    assert.deepEqual(
      calls[1].body.children[0].table_row.cells.map((c) => c[0].text.content),
      ["🇺🇸 10:00:05", "はじめまして。", "Nice to meet you."],
    );

    await call("/api/notion/utterance", { ...u, blockId: S.BLOCK, rowId: S.ROW, trans: "はじめまして。よろしく。" });
    assert.deepEqual(calls.map(pathOf).slice(2), [`PATCH /blocks/${BLOCK}`, `PATCH /blocks/${ROW}`]);
    assert.equal(calls[3].body.table_row.cells[1][0].text.content, "はじめまして。よろしく。");
  }));

test("発言：表の書き込みに失敗してもログは書ける", () =>
  withNotion({ override: (c) => (c.body?.children?.[0]?.type === "table_row" ? [400, { message: "bad row" }] : null) }, async () => {
    const u = { pageId: S.LOG, tableId: S.TABLE, lang: "ja", orig: "はい", trans: "Yes", time: "", primary: "ja" };
    assert.deepEqual(await (await call("/api/notion/utterance", u)).json(), { blockId: S.BLOCK, rowId: null });
  }));

test("ほかの言語：表の見出しは選んだ言語、相手（中国語）の発言は話した言葉を本文に・訳を自分の列に入れて青くする", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    await call("/api/notion/session", { title: "会話", me: "ja", partner: "zh" });
    const table = calls.find((c) => c.body?.children?.[0]?.type === "table").body.children[0].table;
    assert.deepEqual(table.children[0].table_row.cells.map((c) => c[0].text.content), ["時刻", "🇯🇵 日本語", "🇨🇳 中国語"]);

    const u = { pageId: S.LOG, tableId: S.TABLE, lang: "zh", orig: "你好", trans: "こんにちは", time: "10:00:00", primary: "ja" };
    await call("/api/notion/utterance", u);
    const callout = calls.find((c) => c.body?.children?.[0]?.type === "callout").body.children[0].callout;
    assert.equal(callout.icon.emoji, "🇨🇳");
    assert.equal(callout.color, "blue_background");
    assert.equal(callout.rich_text.map((r) => r.text.content).join(""), "10:00:00  你好\nこんにちは");
    const row = calls.find((c) => c.body?.children?.[0]?.type === "table_row").body.children[0].table_row;
    assert.deepEqual(row.cells.map((c) => c[0].text.content), ["🇨🇳 10:00:00", "こんにちは", "你好"]);
  }));

test("知らない言語コードは使わない（見出しは日本語⇄英語、言語不明の発言は自分の発言として扱う）", () =>
  withNotion({ db: "db-1" }, async (calls) => {
    await call("/api/notion/session", { title: "会話", me: "xx", partner: "<b>" });
    const table = calls.find((c) => c.body?.children?.[0]?.type === "table").body.children[0].table;
    assert.deepEqual(table.children[0].table_row.cells.map((c) => c[0].text.content), ["時刻", "🇯🇵 日本語", "🇺🇸 英語"]);
    await call("/api/notion/utterance", { pageId: S.LOG, lang: "zz", orig: "???", trans: "", time: "", primary: "qq" });
    const callout = calls.at(-1).body.children[0].callout;
    assert.equal(callout.icon.emoji, "💬");
    assert.equal(callout.color, "gray_background");
  }));

// ---- 記録先のページの自動判定と「Notionページを準備」 ------------------------------
const TOP = uuid("8");
const page = (id, parent, title = "") => ({
  object: "page",
  id,
  parent,
  properties: { title: { type: "title", title: [{ plain_text: title }] } },
});
const noParentEnv = { ...env, NOTION_PARENT_PAGE: "" };
const callNoParent = (path, body) => handleApi(req(path, { body }), noParentEnv, opts);

test("記録先のページ：NOTION_PARENT_PAGE がなければ、接続を追加したいちばん上のページを使う", () =>
  withNotion(
    {
      override: (c) =>
        c.method === "POST" && c.path === "/search"
          ? [200, {
              results: [
                page(TOP, { type: "workspace", workspace: true }, "N-Translator"),
                page(uuid("9"), { type: "page_id", page_id: TOP }, "子ページ"),
                page(uuid("a"), { type: "database_id", database_id: "db" }, "会話の行"),
              ],
              has_more: false,
            }]
          : null,
    },
    async (calls) => {
      const res = await callNoParent("/api/notion/session", { title: "会話", me: "ja", partner: "en" });
      assert.equal(res.status, 200);
      const db = calls.find((c) => c.method === "POST" && c.path === "/databases");
      assert.equal(db.body.parent.page_id, TOP);
    },
  ));

test("記録先のページ：接続を追加したページが複数あると、URL の設定を案内する", () =>
  withNotion(
    {
      override: (c) =>
        c.method === "POST" && c.path === "/search"
          ? [200, { results: [page(TOP, { type: "workspace", workspace: true }, "A"), page(uuid("9"), { type: "workspace", workspace: true }, "B")], has_more: false }]
          : null,
    },
    async () => {
      const res = await callNoParent("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 400);
      const { error } = await res.json();
      assert.match(error, /2つ.*NOTION_PARENT_PAGE/);
      assert.doesNotMatch(error, /「?[AB]」?、|（A/); // ページの名前は返さない
    },
  ));

test("記録先のページ：「翻訳ログ」があれば、ページを数えずにその親を使う（会話がいくら増えても決まる）", () =>
  withNotion(
    {
      override: (c) => {
        if (c.method !== "POST" || c.path !== "/search") return null;
        if (c.body.filter.value === "database") {
          return [200, {
            results: [
              { object: "database", id: "db-1", title: [{ plain_text: "翻訳ログ" }], parent: { type: "page_id", page_id: TOP } },
              { object: "database", id: "db-x", title: [{ plain_text: "翻訳ログ（古い）" }], parent: { type: "page_id", page_id: uuid("9") } },
            ],
            has_more: false,
          }];
        }
        return [200, { results: [], has_more: true, next_cursor: "more" }]; // 呼ばれたら失敗するように
      },
    },
    async (calls) => {
      const res = await callNoParent("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 200);
      assert.equal(calls.filter((c) => c.path === "/search").length, 1);
      assert.ok(calls.some((c) => pathOf(c) === `GET /blocks/${TOP}/children`));
    },
  ));

test("記録先のページ：個人のトークン（PAT）では自動で決めず、URL の設定を案内する", () =>
  withNotion(
    { override: (c) => (c.method === "GET" && c.path === "/users/me" ? [200, { object: "user", type: "person", person: {} }] : null) },
    async (calls) => {
      const res = await callNoParent("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /NOTION_PARENT_PAGE/);
      assert.equal(calls.some((c) => c.path === "/search"), false);
    },
  ));

test("記録先のページ：見えるページが多すぎるときは途中で決めず、URL の設定を案内する", () =>
  withNotion(
    {
      override: (c) =>
        c.method === "POST" && c.path === "/search"
          ? [200, { results: Array.from({ length: 100 }, (_, i) => page(uuid("9"), { type: "page_id", page_id: TOP }, `p${i}`)), has_more: true, next_cursor: "next" }]
          : null,
    },
    async (calls) => {
      const res = await callNoParent("/api/notion/session", { title: "会話" });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /多すぎ.*NOTION_PARENT_PAGE/);
      assert.equal(calls.filter((c) => c.path === "/search").length, 6); // 翻訳ログを探す1回 + ページを数える5回
      assert.equal(calls.some((c) => c.method !== "GET" && c.path !== "/search"), false);
    },
  ));

test("Notionページを準備：説明と起動ボタン（キーなしのURL）と翻訳ログを作り、2回目は何も増やさない", async () => {
  resetNotionCache();
  const made = { embed: false, db: false };
  const m = mockFetch((c) => {
    if (c.method === "GET" && c.path.startsWith(`/blocks/${PARENT}/children`)) {
      const results = [];
      if (made.embed) results.push({ id: "e1", type: "embed", embed: { url: `${ORIGIN}/` } });
      if (made.db) results.push({ id: "db-new", type: "child_database", child_database: { title: "翻訳ログ" } });
      return [200, { results, has_more: false }];
    }
    if (c.method === "PATCH" && c.path === `/blocks/${PARENT}/children`) {
      made.embed = true;
      return [200, { results: [{ id: "c1" }, { id: "e1" }] }];
    }
    if (c.method === "POST" && c.path === "/databases") {
      made.db = true;
      return [200, { id: "db-new" }];
    }
    if (c.method === "GET" && c.path.startsWith("/databases/")) return [200, { properties: DEFAULT_PROPS }];
    return [200, {}];
  });
  try {
    const first = await (await call("/api/notion/setup", {})).json();
    assert.deepEqual(first, { pageUrl: `https://www.notion.so/${PARENT}`, addedButton: true, addedDatabase: true });
    const patch = m.calls.find((c) => c.method === "PATCH");
    assert.deepEqual(patch.body.children.map((b) => b.type), ["callout", "embed"]);
    assert.equal(patch.body.children[1].embed.url, `${ORIGIN}/`); // アクセスキーは URL に入れない
    const before = m.calls.length;
    const second = await (await call("/api/notion/setup", {})).json();
    assert.deepEqual(second, { pageUrl: `https://www.notion.so/${PARENT}`, addedButton: false, addedDatabase: false });
    assert.equal(m.calls.slice(before).filter((c) => c.method !== "GET").length, 0);
  } finally {
    m.restore();
  }
});
