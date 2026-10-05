import test from "node:test";
import assert from "node:assert/strict";
import { Uplink, BACKLOG_MS } from "../public/uplink.js";

class FakeSocket {
  constructor() {
    this.sent = [];
    this.bufferedAmount = 0;
  }
  send(data) {
    this.sent.push(data);
  }
}

const opus = { kind: "opus", rate: 16000, bytesPerSecond: 4000 };
const mulaw = { kind: "mulaw", rate: 16000, bytesPerSecond: 16000 };
const packet = () => ({ data: new Uint8Array(80), ms: 20, samples48: 960 });
const chunk = () => ({ data: new Uint8Array(1600), ms: 100 });
const isOgg = (b) => b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;

test("Opus：0.1 秒分ずつ1ページにして送り、接続ごとにヘッダーから始める", () => {
  const up = new Uplink(opus);
  const socket = new FakeSocket();
  up.attach(socket);
  assert.equal(socket.sent.length, 2); // ヘッダー2ページ
  for (let i = 0; i < 10; i++) up.push(packet());
  assert.equal(socket.sent.length, 4); // 0.1 秒ごとに1ページ
  assert.ok(socket.sent.every(isOgg));
});

test("切れている間はためておき、つながり直したらヘッダー → ためた分の順に送る", () => {
  const up = new Uplink(opus);
  up.attach(new FakeSocket());
  up.push(packet()); // まだページになっていない分
  up.detach();
  for (let i = 0; i < 9; i++) up.push(packet());
  assert.equal(Math.round(up.lagMs()), 200); // 切れている間はためている長さ
  const next = new FakeSocket();
  up.attach(next);
  assert.equal(next.sent.length, 4); // ヘッダー2 + ためた 0.2 秒分で2ページ
  assert.ok(next.sent.every(isOgg));
});

test("切れている間にためるのは直近15秒まで。古い分は捨てて数えておく", () => {
  const up = new Uplink(mulaw);
  for (let i = 0; i < BACKLOG_MS / 100 + 30; i++) up.push(chunk()); // 18 秒分
  assert.equal(up.lagMs(), BACKLOG_MS);
  assert.equal(up.droppedMs, 3000);
  const socket = new FakeSocket();
  up.attach(socket);
  assert.equal(socket.sent.length, BACKLOG_MS / 100); // μ-law はヘッダーなしでそのまま送る
});

test("送信が20秒以上詰まったら新しい音声を捨て、5秒まで減ったら送るのを再開する", () => {
  const up = new Uplink(mulaw);
  const socket = new FakeSocket();
  up.attach(socket);
  socket.bufferedAmount = 16000 * 21; // 21 秒分たまっている
  up.push(chunk());
  assert.equal(socket.sent.length, 0);
  assert.equal(up.droppedMs, 100);
  socket.bufferedAmount = 16000 * 10; // まだ 10 秒：捨て続ける
  up.push(chunk());
  assert.equal(socket.sent.length, 0);
  socket.bufferedAmount = 16000 * 4; // 4 秒：再開
  up.push(chunk());
  assert.equal(socket.sent.length, 1);
});
