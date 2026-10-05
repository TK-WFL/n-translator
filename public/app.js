import { Segmenter } from "./segmenter.js";
import { Turns } from "./turns.js";
import { DemoSource } from "./demo.js";
import { BUILTIN_TERMS, buildContext } from "./context.js";
import { createEncoder, pickCodec } from "./codec.js";
import { Uplink } from "./uplink.js";
import { LANGUAGES, isLanguage, language, languageLabel, nativeLabel, usesSpaces } from "./languages.js";

const SONIOX_WS = "wss://stt-rt.soniox.com/transcribe-websocket";
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");
// Notion の埋め込み枠ではマイクが許可されないので、別画面を開くボタンだけ出す
const EMBEDDED = window.self !== window.top && !DEMO;
// 声が聞こえない状態がこれだけ続いたら一時停止する（?silence=秒 で変えられる）
const SILENCE_MS = (Number(params.get("silence")) || 300) * 1000;
// スマホは画面を離れると録音が止まるので、離れた時点で一時停止にする
const PAUSE_WHEN_HIDDEN = matchMedia("(pointer: coarse)").matches;
// 音声の送り方を固定する（切り分け用。?codec=mulaw / ?codec=pcm）
const CODEC = params.get("codec");
// 電波が途切れても、この時間まではつなぎ直しを続ける
const MAX_OUTAGE_MS = 3 * 60 * 1000;

const ICON = {
  pause: `<svg class="ico fill" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="2.6" height="10" rx=".8"/><rect x="9.4" y="3" width="2.6" height="10" rx=".8"/></svg>`,
  play: `<svg class="ico fill" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z"/></svg>`,
  stop: `<svg class="ico fill" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>`,
  close: `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
};

const STATUS = {
  idle: "待機中",
  connecting: "接続中…",
  live: "翻訳中",
  reconnecting: "再接続中…",
  pausing: "一時停止中…",
  paused: "一時停止中",
  ending: "保存中…",
  ended: "終了",
};

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"),
  elapsed: $("elapsed"),
  record: $("record"),
  dock: $("dock"),
  notice: $("notice"),
  noticeIcon: $("noticeIcon"),
  noticeText: $("noticeText"),
  log: $("log"),
  terms: $("terms"),
  termsInput: $("termsInput"),
  menu: $("menu"),
  menuBtn: $("menuBtn"),
  fontSize: $("fontSize"),
  launcher: $("launcher"),
  launchLink: $("launchLink"),
  launchNote: $("launchNote"),
};
const cols = {
  me: document.querySelector('.col[data-role="me"]'),
  partner: document.querySelector('.col[data-role="partner"]'),
};
const ROLES = ["me", "partner"];

const settings = {
  view: ["log", "columns", "face"].includes(storage("view")) ? storage("view") : "log",
  scale: Number(storage("scale")) || 1,
  myLang: isLanguage(storage("myLang")) ? storage("myLang") : "ja",
  partnerLang: isLanguage(storage("partnerLang")) ? storage("partnerLang") : "en",
};
if (settings.partnerLang === settings.myLang) settings.partnerLang = settings.myLang === "en" ? "ja" : "en";

// アクセスキーは、入力欄から登録するか、登録リンクの #k=... で受け取って、この端末に覚えておく
// （# の後ろはサーバーにも送られない）。リンクのキーは、サーバーで正しいと確かめてから覚える
const LINK_KEY = usableKey(new URLSearchParams(location.hash.slice(1)).get("k") || "");
const SAVED_KEY = storage("accessKey") || "";
let ACCESS_KEY = LINK_KEY || SAVED_KEY;

// ヘッダーに入れられない文字（全角など。リンクの後ろに続いた文字を拾ったとき）を含むキーは使わない
function usableKey(key) {
  try {
    new Headers({ "X-Access-Key": key });
    return key;
  } catch {
    return "";
  }
}

// アドレスバーからキーを消す（履歴・スクリーンショット・URLの共有から漏れないように）
function clearKeyFromUrl() {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (!hash.has("k") && !url.searchParams.has("k")) return;
  hash.delete("k");
  url.hash = hash.toString();
  if (url.searchParams.has("k")) url.searchParams.delete("k"); // 以前の版の ?k=... は使わない
  history.replaceState(null, "", url);
}

// サーバーの設定を読み、キーが通ったら覚える。登録リンクのキーが違うときは、覚えているキーのまま続ける
async function loadConfig() {
  try {
    cfg = await api("/api/config");
  } catch (e) {
    if (e.status === 401) clearKeyFromUrl(); // 違うキー・使えないキーのリンクは残さない
    if (e.status !== 401 || !LINK_KEY || !SAVED_KEY || ACCESS_KEY === SAVED_KEY) throw e;
    ACCESS_KEY = SAVED_KEY;
    cfg = await api("/api/config");
    showNotice("開いたリンクのアクセスキーが違うため、この端末に登録済みのキーをそのまま使います。", "info");
  }
  keyAccepted = true;
  if (ACCESS_KEY === LINK_KEY) storage("accessKey", LINK_KEY);
  // 端末に覚えられなかったとき（プライベートブラウズなど）は、リロードで困らないよう残す
  if (storage("accessKey") === ACCESS_KEY) clearKeyFromUrl();
}

let cfg = { soniox: false, notion: false };
let keyAccepted = false; // この端末のキーがサーバーに受け付けられたか（別の端末の登録リンクを出せるか）
let state = "idle";
let session = null; // 「開始」から「終了」までの1回の会話
let stream = null;
let audio = null; // { ctx, source, analyser, sink, pipe: { codec, encoder, uplink, teardown } }
let ws = null;
let wakeLock = null;
let demo = null;
let gen = 0; // 接続し直すたびに増やし、古いタイマーや再接続が新しい接続に触らないようにする
let failures = 0;
let outageSince = null; // 接続が途切れはじめた時刻
let lastVoiceAt = 0;
let codecLabel = "開始すると決まります";
let droppedNoticed = 0;
let notionQueue = Promise.resolve();

// ---- 接続 ------------------------------------------------------------------
async function api(path, body) {
  const headers = { "X-Access-Key": ACCESS_KEY };
  const res = await fetch(path, body === undefined ? { headers } : {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function sonioxConfig(apiKey) {
  return {
    api_key: apiKey,
    model: "stt-rt-v5",
    ...audio.pipe.codec.soniox, // 音声の形式（圧縮の方式による）
    language_hints: [session.pair.me, session.pair.partner],
    enable_language_identification: true,
    enable_endpoint_detection: true,
    translation: { type: "two_way", language_a: session.pair.me, language_b: session.pair.partner },
    // Notion などの組み込みの用語 + 「用語」欄の内容
    context: buildContext(els.termsInput.value),
  };
}

function newSession() {
  const s = {
    startedAt: new Date(),
    // この会話の言語（会話中は変えない）。デモの台本は日本語⇄英語
    pair: DEMO ? { me: "ja", partner: "en" } : { me: settings.myLang, partner: settings.partnerLang },
    activeMs: 0, // 一時停止中を除いた時間
    runStart: null,
    turns: new Turns(),
    notion: null, // 翻訳ログの行を作る Promise（最初の発言のあとに作る）
    notionPage: null,
    notionError: null,
    notified: false,
  };
  s.seg = new Segmenter({
    onChange: () => {
      s.turns.assign(s.seg.segments);
      if (s === session) renderTranscript();
    },
    onSettle: (seg) => {
      s.turns.assign(s.seg.segments);
      if (seg.turn) syncTurn(s, seg.turn);
    },
  });
  return s;
}

const elapsedMs = (s) => s.activeMs + (s.runStart ? Date.now() - s.runStart : 0);

// 新しい会話を始める
async function start() {
  if (!DEMO && !cfg.soniox) {
    showNotice("SONIOX_API_KEY が設定されていません（Cloudflare の Worker の設定 →「変数とシークレット」、ローカルは .env）。");
    return;
  }
  hideNotice();
  session = newSession();
  demo = DEMO ? new DemoSource() : null;
  resetTranscript();
  renderRecord();
  await beginStreaming();
}

async function beginStreaming() {
  const id = ++gen;
  failures = 0;
  outageSince = null;
  setState("connecting");

  if (DEMO) {
    session.runStart = Date.now();
    lastVoiceAt = Date.now();
    setState("live");
    demo.start(handleMessage);
    return;
  }

  // iPhone ではタップの直後（await より前）に作らないと音声を扱えない
  const ctx = new AudioContext();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await startAudio(ctx);
  } catch (e) {
    ctx.close().catch(() => {});
    if (id === gen) fail(`マイクを使えませんでした: ${e.message}`);
    return;
  }
  if (id !== gen) {
    // マイクの許可を待っている間に終了された
    stopAudio();
    stopTracks();
    return;
  }
  stream.getAudioTracks()[0]?.addEventListener("ended", () => {
    if (state === "live" || state === "reconnecting") pause("mic");
  });
  await requestWakeLock();
  session.runStart = Date.now();
  lastVoiceAt = Date.now();
  connect(id);
}

async function startAudio(ctx) {
  await ctx.audioWorklet.addModule("pcm-worklet.js");
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  // 出力は使わないが、処理を回し続けるために無音で出力先へつなぐ
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  audio = { ctx, source, analyser, sink, pipe: null };
  await buildPipe(await pickCodec(ctx.sampleRate, CODEC));
  await ctx.resume();
}

// マイク → 間引き（16kHz 前後）→ 圧縮 → 送り手（Uplink）
async function buildPipe(codec) {
  const { ctx, source, sink } = audio;
  audio.pipe?.teardown();
  const ratio = Math.max(1, Math.round(ctx.sampleRate / codec.rate));
  const node = new AudioWorkletNode(ctx, "pcm-capture", { processorOptions: { ratio } });
  const uplink = new Uplink(codec);
  const encoder = createEncoder(codec, (unit) => uplink.push(unit), () => switchToStandardCodec());
  node.port.onmessage = (e) => encoder.push(new Int16Array(e.data));
  source.connect(node);
  node.connect(sink);
  audio.pipe = {
    codec,
    encoder,
    uplink,
    teardown() {
      node.port.onmessage = null;
      node.disconnect();
      encoder.close();
    },
  };
  codecLabel = codec.label;
  droppedNoticed = 0;
  renderCodecLabel();
}

// 圧縮した音声を受け付けてもらえなかったとき（またはエンコーダの故障）：標準の方式でつなぎ直す
async function switchToStandardCodec() {
  if (!audio || audio.pipe?.codec.kind !== "opus") return;
  await buildPipe(await pickCodec(audio.ctx.sampleRate, "mulaw"));
  ws?.close();
}

function stopAudio() {
  if (!audio) return;
  audio.pipe?.teardown();
  audio.source.disconnect();
  audio.ctx.close().catch(() => {});
  audio = null;
}

function stopTracks() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

async function connect(id) {
  let apiKey;
  try {
    ({ api_key: apiKey } = await api("/api/soniox-key", {}));
  } catch (e) {
    if (id !== gen) return;
    // キーが違うなど、つなぎ直しても直らない失敗はすぐ止める。通信の失敗はつなぎ直す
    if (e.status && e.status < 500) fail(e.message);
    else scheduleReconnect(id);
    return;
  }
  if (id !== gen) return;

  const socket = new WebSocket(SONIOX_WS);
  ws = socket;

  socket.onopen = () => {
    socket.send(JSON.stringify(sonioxConfig(apiKey)));
    socket.configured = true;
    audio?.pipe?.uplink.attach(socket); // ここから音声を流す（切れている間にためた分から）
    if (id === gen) setState("live");
  };

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.error_code != null || msg.error_message) {
      if (!socket.gotResult && audio?.pipe?.codec.kind === "opus") switchToStandardCodec();
      else showNotice(`Soniox: ${msg.error_message || msg.error_code}`);
      socket.close();
      return;
    }
    socket.gotResult = true;
    failures = 0;
    outageSince = null;
    handleMessage(msg);
    if (msg.finished) socket.onFinished?.();
  };

  socket.onclose = () => {
    socket.onFinished?.();
    if (ws !== socket || socket.stopping) return;
    ws = null;
    audio?.pipe?.uplink.detach(); // 切れている間の音声はためておく
    session?.seg.end();
    scheduleReconnect(id);
  };
}

// 想定外の切断：3分間はつなぎ直しを続ける（1, 2, 4, 8, 10, 10…秒おき）
function scheduleReconnect(id) {
  if (id !== gen || !["connecting", "live", "reconnecting"].includes(state)) return;
  outageSince ??= Date.now();
  if (Date.now() - outageSince > MAX_OUTAGE_MS) {
    fail("3分以上つながらなかったため一時停止しました。電波の良い場所で「再開」してください。");
    return;
  }
  setState("reconnecting");
  const delay = Math.min(10000, 1000 * 2 ** Math.min(failures++, 4));
  setTimeout(() => {
    if (id === gen && state === "reconnecting") connect(id);
  }, delay);
}

function handleMessage(msg) {
  if (!session) return;
  const spoke = msg.tokens?.some((t) => t.translation_status !== "translation" && t.text !== "<end>" && t.text?.trim());
  if (spoke) lastVoiceAt = Date.now();
  session.seg.handle(msg);
}

// 音声の送信を止め、Soniox に残りを確定させてから接続を閉じる
async function stopStreaming() {
  gen++;
  // 圧縮途中・まとめ途中の音声を送り切ってから止める
  if (audio?.pipe) {
    await Promise.race([audio.pipe.encoder.flush(), new Promise((r) => setTimeout(r, 500))]);
    audio?.pipe?.uplink.flush();
  }
  stopAudio();
  demo?.stop();
  const socket = ws;
  ws = null;
  if (socket?.readyState === WebSocket.OPEN && socket.configured) {
    socket.stopping = true;
    await new Promise((resolve) => {
      socket.onFinished = resolve;
      setTimeout(() => {
        try {
          socket.send(""); // 終了の合図
        } catch {
          resolve();
        }
      }, 150);
      setTimeout(resolve, 5000);
    });
  }
  socket?.close();
  stopTracks();
  releaseWakeLock();
  if (session?.runStart) {
    session.activeMs += Date.now() - session.runStart;
    session.runStart = null;
  }
  session?.seg.flush();
}

async function pause(reason) {
  if (!["connecting", "live", "reconnecting"].includes(state)) return;
  setState("pausing");
  await stopStreaming();
  setState("paused");
  const notices = {
    silence: `${formatSpan(SILENCE_MS)}声が聞こえなかったので一時停止しました。続けるときは「再開」、終わるときは「終了」を押してください。`,
    hidden: "画面を離れたので一時停止しました。「再開」で続きから翻訳します。",
    mic: "マイクが使えなくなったので一時停止しました。「再開」で続きから翻訳します。",
  };
  if (notices[reason]) showNotice(notices[reason], "info");
  saveStats();
}

async function resume() {
  if (state !== "paused") return;
  hideNotice();
  await beginStreaming();
}

async function end() {
  if (!session || !["connecting", "live", "reconnecting", "paused"].includes(state)) return;
  const streaming = state !== "paused";
  if (els.notice.classList.contains("info")) hideNotice(); // 一時停止の案内はもう要らない
  setState("ending");
  if (streaming) await stopStreaming();
  await notionQueue; // 最後の発言がNotionに書き込まれるのを待つ
  await saveStats();
  setState("ended");
  renderRecord();
}

async function fail(message) {
  await stopStreaming();
  const hasContent = session?.turns.list.length > 0;
  if (hasContent) {
    setState("paused");
    saveStats();
  } else {
    session = null;
    setState("idle");
    resetTranscript();
    renderRecord();
    renderElapsed();
  }
  showNotice(message);
}

async function requestWakeLock() {
  if (wakeLock && !wakeLock.released) return;
  wakeLock = await navigator.wakeLock?.request("screen").catch(() => null);
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ---- Notion ----------------------------------------------------------------
// 翻訳ログの行（=この会話のページ）は、最初の発言が確定したときに作る
function notionPage(s) {
  if (!s.notion) {
    s.notion = api("/api/notion/session", {
      title: `会話 ${formatDate(s.startedAt)}${DEMO ? "（デモ）" : ""}`,
      startedAt: s.startedAt.toISOString(),
      me: s.pair.me, // 2列の表の見出しになる
      partner: s.pair.partner,
    }).then(
      (page) => {
        s.notionPage = page;
        s.notionError = null;
        if (s === session) renderRecord();
        return page;
      },
      (e) => {
        s.notion = null; // 次の発言のときにもう一度作ってみる
        s.notionError = e.message;
        if (s === session) {
          renderRecord();
          notifyOnce(s, `Notionの翻訳ログを作れませんでした: ${e.message}`);
        }
        return null;
      },
    );
    if (s === session) renderRecord();
  }
  return s.notion;
}

// ターンごとに1ブロック。初回は追記し、発言が続いたり訳文が遅れて届いたら同じブロックを更新する
function syncTurn(s, turn) {
  if (!cfg.notion || turn.queued || !turn.orig) return;
  turn.queued = true;
  notionQueue = notionQueue.then(async () => {
    turn.queued = false;
    const page = await notionPage(s);
    if (!page) {
      turn.syncError = "翻訳ログのページがありません";
    } else {
      try {
        const { blockId, rowId } = await api("/api/notion/utterance", {
          pageId: page.logId ?? page.pageId, // ログのタブ（なければページ直下）
          blockId: turn.blockId ?? undefined,
          tableId: page.tableId ?? undefined, // 2列の表
          rowId: turn.rowId ?? undefined,
          lang: turn.lang,
          orig: turn.orig,
          trans: turn.trans,
          time: formatTime(turn.startedAt),
          primary: s.pair.me,
        });
        turn.blockId = blockId;
        turn.rowId = rowId ?? turn.rowId;
        turn.syncError = null;
      } catch (e) {
        turn.syncError = e.message;
        notifyOnce(s, `Notionへの書き込みに失敗しました: ${e.message}`);
      }
    }
    if (s === session) renderTranscript();
  });
}

// 一時停止・終了のときに長さと発言数を書き込む
async function saveStats() {
  const s = session;
  if (!s?.notion) return;
  const page = await s.notion;
  if (!page) return;
  try {
    await api("/api/notion/session/update", {
      pageId: page.pageId,
      minutes: Math.round(elapsedMs(s) / 6000) / 10,
      count: s.turns.list.filter((t) => t.orig).length,
    });
  } catch (e) {
    notifyOnce(s, `Notionの翻訳ログを更新できませんでした: ${e.message}`);
  }
}

function notifyOnce(s, message) {
  if (s.notified) return;
  s.notified = true;
  showNotice(message);
}

// ---- 表示 ------------------------------------------------------------------
function setState(next) {
  state = next;
  els.status.dataset.state = state;
  els.status.textContent = STATUS[state];
  renderDock();
  renderLanguageControls();
}

// 電波が弱いときの表示：送れずに遅れている秒数、切れている間にためている秒数、捨てた分のお知らせ
function renderNetwork() {
  const uplink = audio?.pipe?.uplink;
  const el = els.dock.querySelector(".pill-net");
  if (el) {
    const lag = Math.round((uplink?.lagMs() ?? 0) / 1000);
    const text = state === "reconnecting" && lag ? `${lag}秒分を保存中` : state === "live" && lag >= 2 ? `電波が弱く${lag}秒遅れ` : "";
    el.textContent = text;
    el.hidden = !text;
  }
  const dropped = Math.floor((uplink?.droppedMs ?? 0) / 1000);
  if (dropped > droppedNoticed) {
    droppedNoticed = dropped;
    showNotice(`電波が弱かったため、約${dropped}秒分の音声は翻訳できませんでした（リアルタイムを優先して読み飛ばしました）。`, "info");
  }
}

function renderCodecLabel() {
  const el = $("codecLabel");
  if (el) el.textContent = codecLabel;
}

function renderElapsed() {
  const text = formatElapsed(session ? elapsedMs(session) : 0);
  els.elapsed.textContent = text;
  const pillTime = els.dock.querySelector(".pill-time");
  if (pillTime) pillTime.textContent = text;
}

function renderRecord() {
  const el = els.record;
  const span = (text, className = "muted") => {
    const s = document.createElement("span");
    s.className = className;
    s.textContent = text;
    return s;
  };
  const s = session;
  if (!cfg.notion) return el.replaceChildren(span("Notionに記録しない設定です"));
  if (!s) return el.replaceChildren(span("開始すると翻訳ログに記録します"));
  if (s.notionPage) {
    const a = document.createElement("a");
    a.href = s.notionPage.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `会話 ${formatDate(s.startedAt)} ↗`;
    return el.replaceChildren(a);
  }
  if (s.notionError) {
    const err = span("作成できませんでした", "error");
    err.title = s.notionError;
    return el.replaceChildren(err);
  }
  el.replaceChildren(span(s.notion ? "作成中…" : "最初の発言のあとに作成します"));
}

function renderDock() {
  const face = settings.view === "face";
  const time = `<span class="pill-time">${formatElapsed(session ? elapsedMs(session) : 0)}</span>`;
  const sep = `<span class="pill-sep"></span>`;
  const btn = (act, icon, label, cls = "") =>
    `<button class="pill-btn ${cls}" data-act="${act}" aria-label="${label}">${icon}<span class="lbl">${label}</span></button>`;
  const exitFace = face
    ? `${sep}<button class="pill-btn" data-act="exitFace" aria-label="対面表示を終わる">${ICON.close}</button>`
    : "";
  const net = `<span class="pill-net" hidden></span>`; // 電波が弱いときの遅れ（renderNetwork で更新）
  const pauseBtn = btn("pause", ICON.pause, "一時停止");
  const endBtn = btn("end", ICON.stop, "終了", "end");

  let html;
  if (state === "idle" || state === "ended") {
    const label = state === "ended" ? "新しく開始" : "翻訳を開始";
    html = face
      ? `<div class="pill"><button class="pill-btn" data-act="start" style="color:var(--blue);font-weight:500"><span class="rec-dot"></span>${label}</button>${exitFace}</div>`
      : `<button class="start-btn" data-act="start"><span class="rec-dot"></span>${label}</button>`;
  } else if (state === "live") {
    html = `<div class="pill"><span class="level" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${time}${net}${sep}${pauseBtn}${endBtn}${exitFace}</div>`;
  } else if (state === "paused") {
    html = `<div class="pill"><span class="pause-mark">${ICON.pause}</span>${time}${sep}${btn("resume", ICON.play, "再開")}${endBtn}${exitFace}</div>`;
  } else if (state === "connecting" || state === "reconnecting") {
    html = `<div class="pill"><span class="spinner"></span><span class="pill-label">${STATUS[state]}</span>${time}${net}${sep}${endBtn}${exitFace}</div>`;
  } else {
    html = `<div class="pill"><span class="spinner"></span><span class="pill-label">${STATUS[state]}</span>${time}</div>`;
  }
  els.dock.innerHTML = html;
  renderNetwork();
  if (state === "live") runMeter();
}

// 録音中のバー：マイクの音量に合わせて動かす
let meterFrame = 0;
function runMeter() {
  cancelAnimationFrame(meterFrame);
  const bars = [...els.dock.querySelectorAll(".level i")];
  if (!bars.length) return;
  const weights = [0.6, 1, 0.8, 0.5];
  const data = new Uint8Array(512);
  let level = 0;
  const frame = () => {
    if (state !== "live" || !bars[0].isConnected) return;
    let target;
    if (audio) {
      audio.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      target = Math.min(1, (Math.sqrt(sum / data.length) / 128) * 5);
    } else {
      target = Date.now() - lastVoiceAt < 600 ? 0.4 + Math.random() * 0.5 : 0.05;
    }
    level += (target - level) * 0.35;
    bars.forEach((b, i) => {
      b.style.height = `${4 + Math.round(level * 16 * weights[i])}px`;
    });
    meterFrame = requestAnimationFrame(frame);
  };
  frame();
}

// 確定済みのターン + 話している途中の未確定トークンを、表示用の行にまとめる
function viewItems() {
  const s = session;
  if (!s) return [];
  const items = s.turns.list.map((t) => ({
    id: t.id,
    lang: t.lang,
    orig: t.orig,
    trans: t.trans,
    origNf: "",
    transNf: "",
    time: t.startedAt,
    active: !t.last.ended,
    sync: t.syncError ? "err" : t.blockId ? "ok" : null,
    syncError: t.syncError,
  }));

  const { orig, trans, lang } = s.seg.live;
  const lastTurn = s.turns.list[s.turns.list.length - 1];
  let last = items[items.length - 1];
  if (orig) {
    if (lastTurn && !lastTurn.last.ended) {
      last.origNf = orig; // 話している途中の発言の続き
    } else if (lastTurn && s.turns.canJoin(lastTurn, lang, new Date())) {
      last.origNf = spaced(orig, lang, last.orig); // 同じ人が続けて話している
      last.active = true;
    } else {
      last = { id: "live", lang, orig: "", trans: "", origNf: orig, transNf: "", time: new Date(), active: true, sync: null };
      items.push(last);
    }
  }
  if (trans) {
    const target = items.findLast((i) => i.orig) ?? last;
    if (target) target.transNf = spaced(trans, s.seg.live.transLang ?? otherOf(target.lang), target.trans);
  }
  return items;
}

// 表示している会話の言語の組み合わせ（会話がなければ、次に使う組み合わせ）
const currentPair = () => session?.pair ?? { me: settings.myLang, partner: settings.partnerLang };
const otherOf = (lang) => (lang === currentPair().me ? currentPair().partner : currentPair().me);
// 空白で区切る言語では、前の文と未確定の続きの間に空白を入れる
const spaced = (nf, lang, before) => (usesSpaces(lang) && before && !/^\s/.test(nf) ? ` ${nf}` : nf);

const logNodes = new Map();
const colNodes = { me: new Map(), partner: new Map() };

function renderTranscript() {
  const items = viewItems();
  if (settings.view === "log") renderLog(items);
  else renderColumns(items);
}

function resetTranscript() {
  logNodes.clear();
  colNodes.me.clear();
  colNodes.partner.clear();
  els.log.querySelectorAll(".callout").forEach((n) => n.remove());
  for (const role of ROLES) cols[role].querySelector(".col-list").replaceChildren();
  renderTranscript();
}

// 一番下を見ているときだけ、新しい発言に合わせてスクロールする
function stick(update, scroller = document.scrollingElement) {
  const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  update();
  if (atBottom) scroller.scrollTop = scroller.scrollHeight;
}

// 要素を items の順に並べる（訳文があとから出る列でも順番が崩れないように）
function place(list, el, prev) {
  if (prev ? el.previousElementSibling !== prev : list.firstElementChild !== el) {
    if (prev) prev.after(el);
    else list.prepend(el);
  }
}

function renderLog(items) {
  stick(() => {
    els.log.querySelector(".empty").hidden = items.length > 0;
    const seen = new Set();
    let prev = els.log.querySelector(".empty");
    for (const item of items) {
      seen.add(item.id);
      let node = logNodes.get(item.id);
      if (!node) {
        node = createCallout();
        logNodes.set(item.id, node);
      }
      place(els.log, node.el, prev);
      prev = node.el;

      // 話した言葉を本文に、その訳を灰色で添える。背景色で自分（灰）と相手（青）を分ける
      const mine = !item.lang || item.lang === currentPair().me;
      node.el.dataset.role = mine ? "me" : "partner";
      node.el.classList.toggle("active", item.active);
      node.icon.textContent = language(item.lang).flag;
      node.time.textContent = formatTime(item.time);
      node.sync.dataset.state = item.sync ?? "";
      node.sync.textContent = item.sync === "ok" ? "Notion ✓" : item.sync === "err" ? "Notion ✕" : "";
      node.sync.title = item.syncError ?? "";
      setText(node.main, item.orig, item.origNf, "…");
      setText(node.sub, item.trans, item.transNf);
    }
    for (const [id, node] of logNodes) {
      if (!seen.has(id)) {
        node.el.remove();
        logNodes.delete(id);
      }
    }
  });
}

function createCallout() {
  const el = document.createElement("article");
  el.className = "callout";
  el.innerHTML = `<div class="callout-icon" aria-hidden="true"></div><div class="callout-body"><div class="callout-meta"><time></time><span class="sync"></span></div><p class="callout-main" dir="auto"></p><p class="callout-sub" dir="auto"></p></div>`;
  return {
    el,
    icon: el.querySelector(".callout-icon"),
    time: el.querySelector("time"),
    sync: el.querySelector(".sync"),
    main: el.querySelector(".callout-main"),
    sub: el.querySelector(".callout-sub"),
  };
}

// 2列・対面：それぞれの言語の列に、その言語の文だけを並べる。
// 相手の発言の訳を大きく、その言語で話された（自分側の）発言を小さく出す
function renderColumns(items) {
  const face = settings.view === "face";
  const pair = currentPair();
  for (const role of ROLES) {
    const lang = pair[role];
    const list = cols[role].querySelector(".col-list");
    const nodes = colNodes[role];
    stick(
      () => {
        const seen = new Set();
        let prev = null;
        for (const item of items) {
          const own = item.lang === lang;
          const [text, nf] = own ? [item.orig, item.origNf] : [item.trans, item.transNf];
          if (!text && !nf) continue;
          seen.add(item.id);
          let el = nodes.get(item.id);
          if (!el) {
            el = document.createElement("p");
            el.className = "line";
            el.dir = "auto";
            nodes.set(item.id, el);
          }
          place(list, el, prev);
          prev = el;
          el.classList.toggle("own", own);
          setText(el, text, nf);
        }
        for (const [id, el] of nodes) {
          if (!seen.has(id)) {
            el.remove();
            nodes.delete(id);
          }
        }
      },
      face ? cols[role].querySelector(".col-body") : undefined,
    );
  }
}

// 言語の選択欄（ページ上部の「言語」と、2列・対面の各列の見出し）。会話中は変えられない
function renderLanguageControls() {
  const locked = Boolean(session) && !["idle", "ended"].includes(state);
  // 会話中はその会話の言語、それ以外は次の会話で使う言語
  const pair = locked ? session.pair : { me: settings.myLang, partner: settings.partnerLang };
  for (const select of document.querySelectorAll(".lang-select")) {
    const code = pair[select.dataset.role];
    const l = language(code);
    // 相手の言語の一覧は、相手の言語での表記にする（相手の言語を変えたら作り直す）
    const viewer = select.dataset.role === "partner" ? pair.partner : "ja";
    if (select.dataset.viewer !== viewer) {
      select.innerHTML = languageOptions(select.dataset.role, viewer);
      select.dataset.viewer = viewer;
    }
    select.value = code;
    select.disabled = locked;
    // 対面表示の相手側は、相手が読めるようその言語での名前にする
    select.previousElementSibling.textContent =
      `${l.flag} ${select.parentElement.dataset.show === "native" ? l.native : l.name}`;
    select.parentElement.title = locked ? "会話中は変えられません（終了すると変えられます）" : "";
  }
  $("langSwap").disabled = locked;
}

// 自分の言語：日本語の名前（その言語での名前）。
// 相手の言語：相手が読めるよう、その言語での名前＋相手の言語での名前。見出しは訳せないので区切り線にする
function languageOptions(role, viewer) {
  const label = role === "partner" ? (code) => nativeLabel(code, viewer) : languageLabel;
  const option = (l) => `<option value="${l.code}">${label(l.code)}</option>`;
  const common = LANGUAGES.filter((l) => l.common).map(option).join("");
  const others = LANGUAGES.filter((l) => !l.common).map(option).join("");
  return role === "partner"
    ? `${common}<option disabled>──────────</option>${others}`
    : `<optgroup label="よく使う言語">${common}</optgroup><optgroup label="その他の言語">${others}</optgroup>`;
}

// 片方を、もう片方と同じ言語にしたときは入れ替える
function setLanguage(role, code) {
  const other = role === "me" ? "partner" : "me";
  const pair = { me: settings.myLang, partner: settings.partnerLang };
  if (pair[other] === code) pair[other] = pair[role];
  pair[role] = code;
  settings.myLang = pair.me;
  settings.partnerLang = pair.partner;
  storage("myLang", pair.me);
  storage("partnerLang", pair.partner);
  renderLanguageControls();
  renderTranscript();
}

// 確定部分 + 未確定部分（薄い色）を描画。変化がなければ触らない
function setText(el, text, nf, placeholder = "") {
  const key = `${text}\u0000${nf}\u0000${placeholder}`;
  if (el._key === key) return;
  el._key = key;
  el.replaceChildren();
  if (text) el.append(text);
  if (nf) {
    const span = document.createElement("span");
    span.className = "nf";
    span.textContent = nf;
    el.append(span);
  }
  if (!text && !nf && placeholder) {
    const span = document.createElement("span");
    span.className = "pending";
    span.textContent = placeholder;
    el.append(span);
  }
}

// ---- UI --------------------------------------------------------------------
function showNotice(message, kind = "error", link = null) {
  els.notice.hidden = false;
  els.notice.classList.toggle("info", kind === "info");
  els.noticeIcon.textContent = kind === "info" ? "💡" : "⚠️";
  els.noticeText.textContent = message;
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = link.label;
    els.noticeText.append(" ", a);
  }
}

// 記録先の Notion ページに、説明・「翻訳をはじめる」ボタン・翻訳ログをまとめて用意する（何度押しても増えない）
async function setupNotionPage() {
  if (!cfg.notion) {
    showNotice("Notion が設定されていません（Cloudflare の「変数とシークレット」に NOTION_TOKEN を登録してください）。");
    return;
  }
  showNotice("Notion のページを準備しています…", "info");
  try {
    const r = await api("/api/notion/setup", {});
    const added = [r.addedButton && "説明と「翻訳をはじめる」ボタン", r.addedDatabase && "翻訳ログ"].filter(Boolean);
    const message = added.length ? `Notion のページに${added.join("と")}を追加しました。` : "Notion のページはもう準備できています。";
    showNotice(message, "info", { href: r.pageUrl, label: "Notion で開く ↗" });
  } catch (e) {
    showNotice(`Notion のページを準備できませんでした: ${e.message}`);
  }
}

function hideNotice() {
  els.notice.hidden = true;
}

function setView(view) {
  settings.view = view;
  storage("view", view);
  document.body.dataset.view = view;
  for (const tab of document.querySelectorAll(".tab")) {
    tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  }
  renderDock();
  renderTranscript();
  if (view === "face") {
    for (const role of ROLES) {
      const body = cols[role].querySelector(".col-body");
      body.scrollTop = body.scrollHeight;
    }
  }
}

function setScale(next) {
  settings.scale = Math.min(2.2, Math.max(0.7, Math.round(next * 10) / 10));
  document.documentElement.style.setProperty("--scale", settings.scale);
  els.fontSize.textContent = `${Math.round(settings.scale * 100)}%`;
  storage("scale", String(settings.scale));
}

// ---- アクセスキーの入力 ------------------------------------------------------------
// キーが正しいことをサーバーに確かめてから、この端末に覚えさせて開き直す
async function registerKey(e) {
  e.preventDefault();
  const key = $("keyInput").value.trim();
  const error = $("keyError");
  error.hidden = true;
  if (!key) return;
  if (!usableKey(key)) {
    error.textContent = "アクセスキーが違います。";
    error.hidden = false;
    return;
  }
  const res = await fetch("/api/config", { headers: { "X-Access-Key": key } }).catch(() => null);
  if (!res?.ok) {
    error.textContent = res?.status === 401 ? "アクセスキーが違います。" : "サーバーに接続できませんでした。";
    error.hidden = false;
    return;
  }
  storage("accessKey", key);
  // 端末に覚えられないとき（プライベートブラウズなど）は、# の後ろに付けて開き直す
  if (storage("accessKey") !== key) location.hash = `k=${encodeURIComponent(key)}`;
  location.reload();
}

// ---- 別の端末を登録 ------------------------------------------------------------
// キーは # の後ろに入れる（# 以降はサーバーにも、リンク先への Referer にも送られない）
const deviceLink = () => `${location.origin}/#k=${encodeURIComponent(ACCESS_KEY)}`;

function openDeviceDialog() {
  const ready = Boolean(ACCESS_KEY) && keyAccepted;
  setDeviceStatus(ready ? "" : "この端末はまだ登録されていないため、リンクを作れません。", !ready);
  $("deviceCopy").disabled = !ready;
  $("deviceShare").hidden = !ready || typeof navigator.share !== "function";
  $("deviceDialog").showModal();
}

function setDeviceStatus(text, error = false) {
  const el = $("deviceStatus");
  el.hidden = !text;
  el.textContent = text;
  el.classList.toggle("error", error);
}

async function copyDeviceLink() {
  try {
    await navigator.clipboard.writeText(deviceLink());
    setDeviceStatus("コピーしました。登録したい端末のブラウザ（Safari・Chrome）のアドレス欄に貼り付けて開いてください。");
  } catch {
    setDeviceStatus("コピーできませんでした。「共有…」から送ってください。", true);
  }
}

async function shareDeviceLink() {
  try {
    await navigator.share({ title: "N-Translator（端末の登録）", url: deviceLink() });
  } catch (e) {
    if (e.name !== "AbortError") setDeviceStatus("共有できませんでした。「リンクをコピー」を使ってください。", true);
  }
}

function toggleMenu(open = els.menu.hidden) {
  els.menu.hidden = !open;
  els.menuBtn.setAttribute("aria-expanded", String(open));
}

function formatTime(d) {
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(d) {
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(ms) {
  const t = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}

function formatSpan(ms) {
  return ms >= 60000 ? `${Math.round(ms / 60000)}分間` : `${Math.round(ms / 1000)}秒間`;
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

// ---- 起動 ------------------------------------------------------------------
if (EMBEDDED) {
  document.body.classList.add("embedded");
  els.launcher.hidden = false;
  // 埋め込みの URL にはキーを入れない。翻訳画面の側が端末に覚えたキーを使い、なければそちらで案内する
  els.launchLink.href = `${location.origin}${location.pathname}`;
} else {
  els.dock.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "start") start();
    else if (act === "pause") pause("user");
    else if (act === "resume") resume();
    else if (act === "end") end();
    else if (act === "exitFace") setView("log");
  });
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  }
  els.menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!els.menu.hidden && !els.menu.contains(e.target)) toggleMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleMenu(false);
  });
  $("fontUp").addEventListener("click", () => setScale(settings.scale + 0.1));
  $("fontDown").addEventListener("click", () => setScale(settings.scale - 0.1));
  for (const select of document.querySelectorAll(".lang-select")) {
    select.addEventListener("change", () => setLanguage(select.dataset.role, select.value));
  }
  $("langSwap").addEventListener("click", () => setLanguage("me", settings.partnerLang));
  $("termsMenu").addEventListener("click", () => {
    toggleMenu(false);
    els.terms.open = true;
    els.termsInput.focus();
  });
  $("deviceMenu").addEventListener("click", () => {
    toggleMenu(false);
    openDeviceDialog();
  });
  $("deviceClose").addEventListener("click", () => $("deviceDialog").close());
  $("setupMenu").addEventListener("click", () => {
    toggleMenu(false);
    setupNotionPage();
  });
  $("keyForm").addEventListener("submit", registerKey);
  $("deviceCopy").addEventListener("click", copyDeviceLink);
  $("deviceShare").addEventListener("click", shareDeviceLink);
  $("noticeClose").addEventListener("click", hideNotice);
  els.termsInput.value = storage("terms") ?? "";
  $("builtinTerms").textContent = BUILTIN_TERMS.join("、");
  $("builtinCount").textContent = `（${BUILTIN_TERMS.length}語）`;
  els.termsInput.addEventListener("input", () => storage("terms", els.termsInput.value));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (PAUSE_WHEN_HIDDEN && !DEMO && ["connecting", "live", "reconnecting"].includes(state)) pause("hidden");
      return;
    }
    if (state === "live") {
      audio?.ctx.resume().catch(() => {});
      requestWakeLock();
      runMeter();
    }
  });
  // 開いている画面のアドレス欄に登録リンクを貼ったとき（# の後ろだけ変わると読み込み直されない）
  window.addEventListener("hashchange", () => {
    if (new URLSearchParams(location.hash.slice(1)).has("k")) location.reload();
  });
  window.addEventListener("beforeunload", (e) => {
    if (session && !["idle", "ended"].includes(state)) e.preventDefault();
  });

  // 経過時間の更新と、無音が続いたときの一時停止
  setInterval(() => {
    if (!session) return;
    renderElapsed();
    renderNetwork();
    if (state === "live" && Date.now() - lastVoiceAt > SILENCE_MS) pause("silence");
  }, 1000);

  setScale(settings.scale);
  setView(settings.view);
  setState("idle");
  renderRecord();

  try {
    await loadConfig();
    if (!cfg.soniox && !DEMO) {
      showNotice("SONIOX_API_KEY が設定されていません（Cloudflare の Worker の設定 →「変数とシークレット」、ローカルは .env）。キーなしで画面を試すなら ?demo を付けて開いてください。");
    }
  } catch (e) {
    showNotice(
      e.status === 401
        ? "この端末には、まだアクセスキーが登録されていません（または古いキーです）。下の欄にアクセスキーを入力するか、登録済みの端末で「•••」→「別の端末を登録」のリンクを開いてください。"
        : `サーバーに接続できません: ${e.message}`,
    );
    $("keyForm").hidden = e.status !== 401;
  }
  renderRecord();
}
