// Soniox のエラーの見分け方と、画面に出すメッセージ。
// 一時キーの発行（HTTP のステータス）と WebSocket（error_code）は同じ番号を返す。
// 画面（public/app.js）とサーバー（lib/api.js）の両方から使う

// つなぎ直しても直らないエラーか：キーの誤り（401・403）・残高不足（402）・利用の上限（429）・設定の誤り（400）など。
// タイムアウト（408）と Soniox 側の不調（5xx）はつなぎ直す（Soniox の SDK と同じ分け方）
export const isPermanentSonioxError = (code) => code >= 400 && code < 500 && code !== 408;

// 電波の問題と見分けられるよう、何を確かめればよいかを添える
export function sonioxErrorMessage(code, detail = "") {
  const cause = `Soniox ${code}${detail ? `: ${detail}` : ""}`;
  if (code === 401 || code === 403) {
    return `Soniox の API キーが使えません（${cause}）。SONIOX_API_KEY（Cloudflare の「変数とシークレット」、ローカルは .env）を確かめてください。`;
  }
  if (code === 402) return `Soniox の残高が足りません（${cause}）。Soniox の管理画面で残高・支払い方法を確かめてください。`;
  if (code === 429) return `Soniox の利用の上限に達しました（${cause}）。少し待ってからやり直してください。`;
  return `Soniox でエラーが起きました（${cause}）。`;
}
