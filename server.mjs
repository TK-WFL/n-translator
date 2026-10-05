// ローカル実行用サーバー（依存なし・Node 20+）。Mac だけで使うとき用。
// iPhone や Notion 埋め込みから使うときは Cloudflare Workers に置く（worker.js / README 参照）
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./lib/api.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, "public");
loadEnv(join(ROOT, ".env"));
loadEnv(join(ROOT, ".dev.vars")); // Cloudflare 版と同じ設定ファイルでも動くように

const PORT = Number(process.env.PORT || 8787);
// URL の形にそろえる（80番のときは「:80」が付かない）
const ORIGIN = new URL(`http://localhost:${PORT}`).origin;
const ALLOWED_ORIGINS = [ORIGIN, new URL(`http://127.0.0.1:${PORT}`).origin];
// Cloudflare と同じセキュリティ用のヘッダー（public/_headers の「/*」の分）を付ける
const SECURITY_HEADERS = readHeaders(join(PUBLIC, "_headers"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function readHeaders(file) {
  const headers = {};
  let inAll = false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) inAll = line.trim() === "/*";
    else if (inAll) {
      const i = line.indexOf(":");
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return headers;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(pathname, res) {
  let path;
  try {
    path = normalize(join(PUBLIC, decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));
  } catch {
    res.writeHead(400).end();
    return;
  }
  // public の外・隠しファイル（.claude など）・設定ファイル（_headers）は出さない
  const rel = path.slice(PUBLIC.length + 1);
  if (!path.startsWith(PUBLIC + sep) || rel.split(sep).some((part) => part.startsWith(".")) || rel === "_headers") {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

const server = http.createServer(async (req, res) => {
  // 「GET http://別のサイト/...」「GET //別のサイト/...」のような書き方は受け付けない（自分の URL を偽れないように）
  let url;
  try {
    url = new URL(req.url, ORIGIN);
  } catch {}
  if (!req.url.startsWith("/") || url?.origin !== ORIGIN) {
    res.writeHead(400).end();
    return;
  }
  if (!url.pathname.startsWith("/api/")) {
    if (req.method === "GET") return serveStatic(url.pathname, res);
    res.writeHead(405).end();
    return;
  }

  try {
    const headers = new Headers();
    for (const name of ["content-type", "origin", "x-access-key"]) {
      if (req.headers[name]) headers.set(name, req.headers[name]);
    }
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const response = await handleApi(new Request(url, { method: req.method, headers, body }), process.env, {
      allowedOrigins: ALLOWED_ORIGINS,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const { SONIOX_API_KEY, NOTION_TOKEN, NOTION_PARENT_PAGE } = process.env;
  const notionPage = NOTION_PARENT_PAGE ? "（記録先：NOTION_PARENT_PAGE）" : "（記録先：接続を追加したページを自動で使う）";
  console.log(`N-Translator: http://localhost:${PORT}`);
  console.log(`  Soniox: ${SONIOX_API_KEY ? "OK" : `未設定（デモのみ: http://localhost:${PORT}/?demo）`}`);
  console.log(`  Notion: ${NOTION_TOKEN ? `OK${notionPage}` : "未設定（画面表示のみ）"}`);
});
