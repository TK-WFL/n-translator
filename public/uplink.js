import { OggOpusStream } from "./codec.js";

// 音声の送り手。リアルタイムで訳すことを優先しつつ、電波が途切れても会話が抜けにくくする。
// - つながっていない間は直近の音声をためておき、つながり直したらまとめて送る（古い分は捨てる）
// - 電波が弱くて送信が詰まったら、遅れが膨らまないよう新しい音声を一時的に捨てて追いつく
export const BACKLOG_MS = 15000; // 切れている間にためておく長さ
export const MAX_LAG_MS = 20000; // 送信待ちがこれを超えたら捨て始める（切断明けにまとめて送る15秒分では捨てない）
export const RESUME_LAG_MS = 5000; // ここまで減ったら送るのを再開する
export const PAGE_MS = 100; // Opus は 0.1 秒分ずつまとめて送る（今までの送る間隔と同じ）

export class Uplink {
  constructor(codec) {
    this.codec = codec;
    this.socket = null;
    this.ogg = null;
    this.page = []; // Opus：まだ送っていない 0.1 秒未満の分
    this.pageMs = 0;
    this.backlog = []; // つながっていない間の音声
    this.droppedMs = 0; // 送れずに捨てた長さ（合計）
    this.skipping = false;
  }

  // 接続が始まった（設定を送ったあと）。ためておいた音声から送る
  attach(socket) {
    this.socket = socket;
    if (this.codec.kind === "opus") {
      this.ogg = new OggOpusStream(this.codec.rate);
      for (const header of this.ogg.headers()) socket.send(header);
    }
    const backlog = this.backlog;
    this.backlog = [];
    for (const unit of backlog) this.#send(unit);
    this.flush();
  }

  // 接続が切れた。送りかけの分はためておく
  detach() {
    this.backlog.push(...this.page);
    this.page = [];
    this.pageMs = 0;
    this.socket = null;
    this.ogg = null;
    this.skipping = false;
    this.#trimBacklog();
  }

  push(unit) {
    if (!this.socket) {
      this.backlog.push(unit);
      this.#trimBacklog();
      return;
    }
    const lag = this.lagMs();
    if (lag > MAX_LAG_MS) this.skipping = true;
    else if (lag < RESUME_LAG_MS) this.skipping = false;
    if (this.skipping) {
      this.droppedMs += unit.ms;
      return;
    }
    this.#send(unit);
  }

  // 送りかけの分を送り切る（終了前など）
  flush() {
    if (!this.page.length || !this.socket) return;
    this.socket.send(this.ogg.audioPage(this.page));
    this.page = [];
    this.pageMs = 0;
  }

  // 今どれだけ遅れているか（つながっていればまだ送れていない分、切れていればためている分）
  lagMs() {
    if (!this.socket) return this.backlog.reduce((sum, u) => sum + u.ms, 0);
    return (this.socket.bufferedAmount / this.codec.bytesPerSecond) * 1000 + this.pageMs;
  }

  #send(unit) {
    if (this.codec.kind !== "opus") {
      this.socket.send(unit.data);
      return;
    }
    this.page.push(unit);
    this.pageMs += unit.ms;
    if (this.pageMs >= PAGE_MS) this.flush();
  }

  #trimBacklog() {
    let total = this.backlog.reduce((sum, u) => sum + u.ms, 0);
    while (total > BACKLOG_MS && this.backlog.length) {
      const old = this.backlog.shift();
      total -= old.ms;
      this.droppedMs += old.ms;
    }
  }
}
