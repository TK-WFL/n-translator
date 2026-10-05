// ローカル実行用サーバー（依存なし・Node 18+）。Mac だけで使うとき用。
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
const ALLOWED_ORIGINS = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];

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
  const path = normalize(join(PUBLIC, decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));
  if (!path.startsWith(PUBLIC + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
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
  console.log(`N-Translator: http://localhost:${PORT}`);
  console.log(`  Soniox: ${SONIOX_API_KEY ? "OK" : `未設定（デモのみ: http://localhost:${PORT}/?demo）`}`);
  console.log(`  Notion: ${NOTION_TOKEN && NOTION_PARENT_PAGE ? "OK" : "未設定（画面表示のみ）"}`);
});
