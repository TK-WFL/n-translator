// Cloudflare Workers 用の入口。/api/* は lib/api.js、それ以外は public/ の静的ファイル
import { handleApi } from "./lib/api.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 公開URLになるので、アクセスキー未設定のままAPIを開けない
    if (url.pathname.startsWith("/api/") && !env.ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "ACCESS_KEY が未設定です（npx wrangler secret put ACCESS_KEY）" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    return (await handleApi(request, env, { allowedOrigins: [url.origin] })) ?? env.ASSETS.fetch(request);
  },
};
