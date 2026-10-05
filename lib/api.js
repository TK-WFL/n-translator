// API本体。ローカル（server.mjs）と Cloudflare Workers（worker.js）の両方から使う。
// - Soniox の一時APIキーを発行（本物のキーはブラウザに渡さない）
// - Notion API を代理で呼ぶ（Notion API はブラウザから直接呼べないため）
import { isLanguage, language } from "../public/languages.js";

const NOTION_VERSION = "2022-06-28";
const DB_TITLE = "翻訳ログ";
// 翻訳ログの列。Notion 側で名前を変えられた列は書き込みを省く（止まらないように）
const COLUMNS = { date: "日時", minutes: "長さ（分）", count: "発言数" };

class HttpError extends Error {
  constructor(status, message, upstream) {
    super(message);
    this.status = status;
    this.upstream = upstream;
  }
}

// ページURLでもIDでも受け付ける
export function extractNotionId(s = "") {
  const plain = [...s.matchAll(/[0-9a-f]{32}/gi)].pop();
  if (plain) return plain[0];
  const uuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid ? uuid[0].replace(/-/g, "") : "";
}

// ブラウザから受け取った ID をそのまま URL に入れないよう形式を確かめる
function idParam(value, name) {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, `${name} の形式が正しくありません`);
  }
  return id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Notion ----------------------------------------------------------------
// レート制限（平均3リクエスト/秒）に合わせて直列化し、429/5xx は再試行する
let notionChain = Promise.resolve();
let lastNotionAt = 0;

function notion(env, method, path, body) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastNotionAt + 350 - Date.now();
      if (wait > 0) await sleep(wait);
      lastNotionAt = Date.now();

      const res = await fetch((env.NOTION_API_BASE || "https://api.notion.com/v1") + path, {
        method,
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;

      const retryable = res.status === 429 || res.status === 409 || res.status >= 500;
      if (!retryable || attempt >= 3) {
        throw new HttpError(502, `Notion ${res.status}: ${data.message || res.statusText}`, res.status);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(res.status === 429 && retryAfter ? retryAfter * 1000 : 500 * 2 ** attempt);
    }
  };
  const p = notionChain.then(run, run);
  notionChain = p.catch(() => {});
  return p;
}

// rich_text の1要素は2000文字まで
function richText(text, annotations = {}) {
  const parts = [];
  for (let i = 0; i < text.length; i += 2000) {
    parts.push({ type: "text", text: { content: text.slice(i, i + 2000) }, annotations });
  }
  return parts;
}

// ---- 翻訳ログのデータベース --------------------------------------------------
// 親ページの中の「翻訳ログ」を探し、なければ作る。見つけた結果は覚えておく
let dbCache = null; // { parent, id, props: { title, date, minutes, count } }
let dbPending = null;

export function resetNotionCache() {
  dbCache = null;
  dbPending = null;
}

async function findDatabase(env, parent) {
  let cursor = null;
  do {
    const query = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await notion(env, "GET", `/blocks/${parent}/children${query}`);
    const hit = res.results?.find((b) => b.type === "child_database" && b.child_database?.title === DB_TITLE);
    if (hit) return hit.id;
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return null;
}

async function createDatabase(env, parent) {
  const db = await notion(env, "POST", "/databases", {
    parent: { type: "page_id", page_id: parent },
    is_inline: true,
    icon: { type: "emoji", emoji: "🗂️" },
    title: richText(DB_TITLE),
    properties: {
      名前: { title: {} },
      [COLUMNS.date]: { date: {} },
      [COLUMNS.minutes]: { number: { format: "number" } },
      [COLUMNS.count]: { number: { format: "number" } },
      相手: { select: { options: [] } },
      要約: { rich_text: {} },
    },
  });
  return db.id;
}

// 書き込む列の名前を決める（タイトル列だけは名前が変わっていても種類で見つける）
async function describeDatabase(env, id) {
  const db = await notion(env, "GET", `/databases/${id}`);
  const entries = Object.entries(db.properties || {});
  const column = (name, type) => (entries.some(([key, p]) => key === name && p.type === type) ? name : null);
  return {
    title: entries.find(([, p]) => p.type === "title")?.[0] || "名前",
    date: column(COLUMNS.date, "date"),
    minutes: column(COLUMNS.minutes, "number"),
    count: column(COLUMNS.count, "number"),
  };
}

function logDatabase(env) {
  const parent = extractNotionId(env.NOTION_PARENT_PAGE);
  if (dbCache?.parent === parent) return Promise.resolve(dbCache);
  dbPending ??= (async () => {
    const id =
      extractNotionId(env.NOTION_DATABASE) || (await findDatabase(env, parent)) || (await createDatabase(env, parent));
    dbCache = { parent, id, props: await describeDatabase(env, id) };
    return dbCache;
  })().finally(() => {
    dbPending = null;
  });
  return dbPending;
}

async function createSession(env, { title, startedAt, me, partner }) {
  const create = async () => {
    const db = await logDatabase(env);
    const properties = { [db.props.title]: { title: richText(title) } };
    if (db.props.date && startedAt) properties[db.props.date] = { date: { start: startedAt } };
    if (db.props.count) properties[db.props.count] = { number: 0 };
    return notion(env, "POST", "/pages", {
      parent: { database_id: db.id },
      icon: { type: "emoji", emoji: "🗣️" },
      properties,
    });
  };
  let page;
  try {
    page = await create();
  } catch (e) {
    // データベースが削除・移動されていたら、探し直して1回だけやり直す
    if (e.upstream !== 404 && e.upstream !== 400) throw e;
    resetNotionCache();
    page = await create();
  }
  // ページの中身の枠（ログ／2列のタブ）。作れなくても会話の記録は止めない
  const layout = await buildLayout(env, page.id, { me, partner }).catch((e) => {
    console.error("[layout]", e.message);
    return {};
  });
  return { pageId: page.id, url: page.url, logId: layout.logId ?? null, tableId: layout.tableId ?? null };
}

// ---- 会話ページの中身の枠 ------------------------------------------------------
// 「💬 ログ」タブ（発言ごとのコールアウト）と「📖 2列（対訳）」タブ（時刻｜日本語｜English の表）。
// タブを作れないときは、ログをページ直下に並べ、表は折りたためる見出しの中に置く
const paragraph = (text, extra = {}) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: richText(text, { color: "gray" }), ...extra },
});

const tabLabel = (text, emoji, caption) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: richText(text), icon: { type: "emoji", emoji }, children: [paragraph(caption)] },
});

// 旗は話された言語。自分の発言は灰色、相手の発言は青
const logCaption = (pair) =>
  `${language(pair.me).flag}／${language(pair.partner).flag} は話された言語。本文は話した言葉、灰色はその訳。背景が灰色は自分、青は相手の発言。`;
const TABLE_CAPTION = "発言ごとに1行。左右の列で原文と訳文を見比べられます。";

async function buildLayout(env, pageId, pair) {
  let logId = null;
  let tablePane;
  try {
    const tab = await notion(env, "PATCH", `/blocks/${pageId}/children`, {
      children: [
        {
          object: "block",
          type: "tab",
          tab: { children: [tabLabel("ログ", "💬", logCaption(pair)), tabLabel("2列（対訳）", "📖", TABLE_CAPTION)] },
        },
      ],
    });
    const panes = await notion(env, "GET", `/blocks/${tab.results[0].id}/children?page_size=10`);
    [logId, tablePane] = panes.results.map((b) => b.id);
  } catch (e) {
    if (e.upstream !== 400) throw e;
    const heading = await notion(env, "PATCH", `/blocks/${pageId}/children`, {
      children: [
        {
          object: "block",
          type: "heading_3",
          heading_3: { rich_text: richText("📖 2列（対訳）"), is_toggleable: true, children: [paragraph(TABLE_CAPTION)] },
        },
      ],
    });
    tablePane = heading.results[0].id;
  }
  const table = await notion(env, "PATCH", `/blocks/${tablePane}/children`, {
    children: [
      {
        object: "block",
        type: "table",
        table: {
          table_width: 3,
          has_column_header: true,
          has_row_header: false,
          children: [tableRow(["時刻", headerLabel(pair.me), headerLabel(pair.partner)])],
        },
      },
    ],
  });
  return { logId, tableId: table.results[0].id };
}

function tableRow(cells) {
  return { object: "block", type: "table_row", table_row: { cells: cells.map((text) => richText(text)) } };
}

const headerLabel = (code) => `${language(code).flag} ${language(code).name}`;

// 2列の表の1行：時刻（話された言語の旗つき）｜自分の言語｜相手の言語
function utteranceRow({ lang, orig, trans, time, primary }) {
  const [mine, theirs] = !lang || lang === primary ? [orig, trans] : [trans, orig];
  return tableRow([`${language(lang).flag} ${time}`, mine.trim(), theirs.trim()]);
}

async function updateSession(env, { pageId, minutes, count }) {
  const db = await logDatabase(env);
  const properties = {};
  if (db.props.minutes && Number.isFinite(minutes)) properties[db.props.minutes] = { number: minutes };
  if (db.props.count && Number.isFinite(count)) properties[db.props.count] = { number: count };
  if (Object.keys(properties).length) await notion(env, "PATCH", `/pages/${pageId}`, { properties });
  return { ok: true };
}

// ---- 発言ブロック ------------------------------------------------------------
// 話した言葉を本文に、その訳を灰色で添える。
// アイコンは話された言語の旗、背景色は自分（primary の言語）の発言が灰色・相手の発言が青
function utteranceCallout({ lang, orig, trans, time, primary }, withIcon = true) {
  const rich_text = [...richText(`${time}  `, { color: "gray" }), ...richText(orig.trim() || "…")];
  if (trans.trim()) rich_text.push(...richText(`\n${trans.trim()}`, { color: "gray" }));
  const callout = { rich_text, color: !lang || lang === primary ? "gray_background" : "blue_background" };
  if (withIcon) callout.icon = { type: "emoji", emoji: language(lang).flag };
  return callout;
}

async function writeUtterance(env, { pageId, blockId, tableId, rowId, ...u }) {
  const send = (withIcon) => {
    const callout = utteranceCallout(u, withIcon);
    return blockId
      ? notion(env, "PATCH", `/blocks/${blockId}`, { callout })
      : notion(env, "PATCH", `/blocks/${pageId}/children`, { children: [{ object: "block", type: "callout", callout }] });
  };
  let data;
  try {
    data = await send(true);
  } catch (e) {
    // 絵文字アイコンが弾かれた場合はアイコンなしで再送
    if (e.upstream !== 400) throw e;
    data = await send(false);
  }
  return { blockId: blockId || data.results?.[0]?.id, rowId: await writeRow(env, { tableId, rowId, ...u }) };
}

// 2列の表への書き込み。失敗してもログの記録は止めない（次の更新のときにやり直す）
async function writeRow(env, { tableId, rowId, ...u }) {
  if (!tableId && !rowId) return null;
  try {
    const row = utteranceRow(u);
    if (rowId) {
      await notion(env, "PATCH", `/blocks/${rowId}`, { table_row: row.table_row });
      return rowId;
    }
    const data = await notion(env, "PATCH", `/blocks/${tableId}/children`, { children: [row] });
    return data.results?.[0]?.id ?? null;
  } catch (e) {
    console.error("[table row]", e.message);
    return rowId ?? null;
  }
}

// ---- ルーティング ----------------------------------------------------------
const notionReady = (env) => Boolean(env.NOTION_TOKEN && extractNotionId(env.NOTION_PARENT_PAGE));

function requireNotion(env) {
  if (!notionReady(env)) throw new HttpError(400, "Notion が未設定です");
}

const routes = {
  "GET /api/config": async (env) => ({
    soniox: Boolean(env.SONIOX_API_KEY),
    notion: notionReady(env),
  }),

  "POST /api/soniox-key": async (env) => {
    if (!env.SONIOX_API_KEY) throw new HttpError(400, "SONIOX_API_KEY が設定されていません");
    const res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SONIOX_API_KEY}`, "Content-Type": "application/json" },
      // 使い捨て・有効60秒。ブラウザは受け取ってすぐ1回だけ接続に使う
      body: JSON.stringify({ usage_type: "transcribe_websocket", expires_in_seconds: 60, single_use: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(502, `Soniox ${res.status}: ${data.message || res.statusText}`, res.status);
    return { api_key: data.api_key };
  },

  // 翻訳ログに1行（=1回の会話）を追加する
  "POST /api/notion/session": async (env, body) => {
    requireNotion(env);
    return createSession(env, {
      title: String(body.title || DB_TITLE),
      startedAt: typeof body.startedAt === "string" ? body.startedAt : undefined,
      me: isLanguage(body.me) ? body.me : "ja",
      partner: isLanguage(body.partner) ? body.partner : "en",
    });
  },

  // 一時停止・終了のときに長さと発言数を書き込む
  "POST /api/notion/session/update": async (env, body) => {
    requireNotion(env);
    return updateSession(env, {
      pageId: idParam(body.pageId, "pageId"),
      minutes: Number(body.minutes),
      count: Number(body.count),
    });
  },

  "POST /api/notion/utterance": async (env, body) => {
    requireNotion(env);
    return writeUtterance(env, {
      pageId: idParam(body.pageId, "pageId"),
      blockId: body.blockId ? idParam(body.blockId, "blockId") : undefined,
      tableId: body.tableId ? idParam(body.tableId, "tableId") : undefined,
      rowId: body.rowId ? idParam(body.rowId, "rowId") : undefined,
      lang: isLanguage(body.lang) ? body.lang : null,
      orig: String(body.orig || ""),
      trans: String(body.trans || ""),
      time: String(body.time || ""),
      primary: isLanguage(body.primary) ? body.primary : "ja",
    });
  },

  // 親ページに「翻訳をはじめる」の埋め込みを追加する。
  // Notion の画面で /embed すると URL のクエリが落とされるため、API で作る（キーはサーバー内だけで扱う）
  "POST /api/notion/embed": async (env, body, { origin }) => {
    requireNotion(env);
    const url = env.ACCESS_KEY ? `${origin}/?k=${encodeURIComponent(env.ACCESS_KEY)}` : `${origin}/`;
    await notion(env, "PATCH", `/blocks/${extractNotionId(env.NOTION_PARENT_PAGE)}/children`, {
      children: [{ object: "block", type: "embed", embed: { url } }],
    });
    return { ok: true };
  },
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// /api/* 以外は null を返す（静的ファイルは呼び出し側が配信する）
export async function handleApi(request, env, { allowedOrigins }) {
  const { pathname, origin: selfOrigin } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return null;

  const route = routes[`${request.method} ${pathname}`];
  if (!route) return json(404, { error: "not found" });

  // 他サイトからこのAPIを叩かれないようにする
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return json(403, { error: "forbidden origin" });
  if (env.ACCESS_KEY && !safeEqual(request.headers.get("x-access-key") || "", env.ACCESS_KEY)) {
    return json(401, { error: "アクセスキーがないか、違います" });
  }
  if (request.method === "POST" && !(request.headers.get("content-type") || "").startsWith("application/json")) {
    return json(415, { error: "application/json only" });
  }

  try {
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    return json(200, await route(env, body, { origin: selfOrigin }));
  } catch (e) {
    console.error(`[${request.method} ${pathname}]`, e.message);
    return json(e.status || 500, { error: e.message });
  }
}
