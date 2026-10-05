// Cloudflare Workers 用の入口。/api/* は lib/api.js、それ以外は public/ の静的ファイル
import { handleApi } from "./lib/api.js";

// 公開URLになるので、推測されにくい長さのアクセスキーがないと API を開けない
const MIN_ACCESS_KEY = 16;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") && (env.ACCESS_KEY || "").length < MIN_ACCESS_KEY) {
      const error = env.ACCESS_KEY
        ? `ACCESS_KEY が短すぎます（${MIN_ACCESS_KEY}文字以上にしてください）`
        : "ACCESS_KEY が未設定です（npx wrangler secret put ACCESS_KEY）";
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return (await handleApi(request, env, { allowedOrigins: [url.origin] })) ?? env.ASSETS.fetch(request);
  },
};
