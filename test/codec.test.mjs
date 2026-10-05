import test from "node:test";
import assert from "node:assert/strict";
import { OggOpusStream, mulawEncode, oggCrc, pickCodec } from "../public/codec.js";

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

test("Ogg のチェックサムは標準の検査値と一致する（CRC-32/POSIX の最後の反転なし）", () => {
  assert.equal(oggCrc(ascii("123456789")), 0x89a1897f);
});

test("Ogg：ヘッダー2ページのあと、音声ページの長さ（48kHz のサンプル数）が積み上がる", () => {
  const ogg = new OggOpusStream(16000);
  const [head, tags] = ogg.headers();
  assert.deepEqual([...head.slice(0, 4)], [...ascii("OggS")]);
  assert.equal(head[5], 0x02); // 最初のページの印
  assert.deepEqual([...head.slice(28, 36)], [...ascii("OpusHead")]);
  assert.equal(new DataView(head.buffer).getUint32(28 + 12, true), 16000); // 元の周波数
  assert.deepEqual([...tags.slice(28, 36)], [...ascii("OpusTags")]);

  const units = [0, 1, 2, 3, 4].map(() => ({ data: new Uint8Array(80).fill(7), ms: 20, samples48: 960 }));
  const page = ogg.audioPage(units);
  const v = new DataView(page.buffer);
  assert.equal(v.getBigUint64(6, true), 4800n); // 0.1 秒 = 4800 サンプル（48kHz）
  assert.equal(v.getUint32(18, true), 2); // ページ番号はヘッダーの続き
  assert.equal(page[26], 5); // 区切り5つ（80 バイト × 5）

  // チェックサム欄を 0 にして計算し直すと一致する
  const copy = page.slice();
  new DataView(copy.buffer).setUint32(22, 0, true);
  assert.equal(oggCrc(copy), v.getUint32(22, true));
});

test("Ogg：255 バイト以上のパケットは 255 ずつ区切り、割り切れるときは長さ 0 の区切りを足す", () => {
  const ogg = new OggOpusStream(16000);
  const page = ogg.page([new Uint8Array(255), new Uint8Array(300)], 0);
  assert.equal(page[26], 4);
  assert.deepEqual([...page.slice(27, 31)], [255, 0, 255, 45]);
});

test("μ-law：無音・最大・最小が規格どおりの値になる", () => {
  assert.deepEqual([...mulawEncode(new Int16Array([0, 32767, -32768]))], [0xff, 0x80, 0x00]);
});

test("圧縮が使えない環境（Node）では μ-law（16kHz）を選ぶ。?codec=pcm なら圧縮なし", async () => {
  const mulaw = await pickCodec(48000);
  assert.equal(mulaw.kind, "mulaw");
  assert.deepEqual(mulaw.soniox, { audio_format: "mulaw", sample_rate: 16000, num_channels: 1 });
  const pcm = await pickCodec(48000, "pcm");
  assert.deepEqual(pcm.soniox, { audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1 });
});
