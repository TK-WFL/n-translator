// 電波が弱くても送れるよう、マイクの音声を圧縮して送る。
// - 使えるブラウザ（Chrome、iPhone の Safari 26 以降など）：Opus 32kbps を Ogg に詰めて送る（圧縮なしの約1/8）
// - 使えないブラウザ：μ-law（電話と同じ方式。圧縮なしの1/2）
// 32kbps は、音声認識の精度をほとんど落とさずに通信量を大きく減らせる値（16kbps まで下げると精度の低下が目立つ）
export const OPUS_BITRATE = 32000;
const OPUS_FRAME_US = 20000; // Opus の1フレーム 20ms
const OPUS_PRE_SKIP = 312; // 標準的なエンコーダの先読み（48kHz のサンプル数）

// ?codec=mulaw / ?codec=pcm で方式を固定できる（切り分け用）
export async function pickCodec(nativeRate, forced) {
  if (forced !== "mulaw" && forced !== "pcm" && typeof AudioEncoder !== "undefined") {
    for (const rate of [16000, 48000]) {
      if (nativeRate % rate !== 0) continue; // 間引きで正確にこの周波数にできるときだけ
      const config = {
        codec: "opus",
        sampleRate: rate,
        numberOfChannels: 1,
        bitrate: OPUS_BITRATE,
        opus: { frameDuration: OPUS_FRAME_US },
      };
      try {
        if ((await AudioEncoder.isConfigSupported(config)).supported) {
          return {
            kind: "opus",
            label: "圧縮（Opus 32kbps）",
            rate,
            config,
            bytesPerSecond: OPUS_BITRATE / 8,
            soniox: { audio_format: "auto" },
          };
        }
      } catch {
        // 次の候補へ
      }
    }
  }
  const rate = nativeRate / Math.max(1, Math.round(nativeRate / 16000));
  if (forced === "pcm") {
    return {
      kind: "pcm",
      label: "圧縮なし（256kbps）",
      rate,
      bytesPerSecond: rate * 2,
      soniox: { audio_format: "pcm_s16le", sample_rate: rate, num_channels: 1 },
    };
  }
  return {
    kind: "mulaw",
    label: "標準（μ-law 128kbps）",
    rate,
    bytesPerSecond: rate,
    soniox: { audio_format: "mulaw", sample_rate: rate, num_channels: 1 },
  };
}

// 16bit PCM を受け取り、送る単位（{ data, ms }）にして onUnit へ渡す
export function createEncoder(codec, onUnit, onError) {
  if (codec.kind === "opus") return new OpusEncoder(codec, onUnit, onError);
  const toBytes = codec.kind === "mulaw" ? mulawEncode : (pcm) => new Uint8Array(pcm.buffer.slice(0));
  return {
    push(pcm) {
      onUnit({ data: toBytes(pcm), ms: (pcm.length * 1000) / codec.rate });
    },
    flush: async () => {},
    close() {},
  };
}

class OpusEncoder {
  constructor(codec, onUnit, onError) {
    this.rate = codec.rate;
    this.timestamp = 0;
    this.encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const us = chunk.duration ?? OPUS_FRAME_US;
        onUnit({ data, ms: us / 1000, samples48: Math.round(us * 0.048) });
      },
      error: (e) => onError?.(e),
    });
    this.encoder.configure(codec.config);
  }

  push(pcm) {
    const frame = new AudioData({
      format: "s16",
      sampleRate: this.rate,
      numberOfFrames: pcm.length,
      numberOfChannels: 1,
      timestamp: this.timestamp,
      data: pcm,
    });
    this.timestamp += Math.round((pcm.length * 1e6) / this.rate);
    this.encoder.encode(frame);
    frame.close();
  }

  // エンコーダの中に残っている音声を出し切る
  async flush() {
    if (this.encoder.state === "configured") await this.encoder.flush().catch(() => {});
  }

  close() {
    if (this.encoder.state !== "closed") this.encoder.close();
  }
}

// ---- Ogg（Opus を入れる箱） --------------------------------------------------
// 接続ごとに新しいストリームとして始める（ヘッダー → 音声ページ）。
// つながり直したときも、ためておいた音声を新しいストリームとして送り直せる
export class OggOpusStream {
  constructor(inputRate) {
    this.inputRate = inputRate;
    this.serial = (Math.random() * 0xffffffff) >>> 0;
    this.sequence = 0;
    this.granule = 0; // ここまでに送った音声の長さ（48kHz のサンプル数）
  }

  headers() {
    const head = new Uint8Array(19);
    const h = new DataView(head.buffer);
    head.set(ascii("OpusHead"));
    head[8] = 1; // バージョン
    head[9] = 1; // モノラル
    h.setUint16(10, OPUS_PRE_SKIP, true);
    h.setUint32(12, this.inputRate, true);
    h.setInt16(16, 0, true); // 音量の補正なし
    head[18] = 0; // チャンネルの割り当て：モノラル/ステレオ

    const vendor = ascii("notion-live-translate");
    const tags = new Uint8Array(8 + 4 + vendor.length + 4);
    const t = new DataView(tags.buffer);
    tags.set(ascii("OpusTags"));
    t.setUint32(8, vendor.length, true);
    tags.set(vendor, 12);
    t.setUint32(12 + vendor.length, 0, true); // コメントなし

    return [this.page([head], 0x02), this.page([tags], 0)];
  }

  audioPage(units) {
    for (const u of units) this.granule += u.samples48;
    return this.page(
      units.map((u) => u.data),
      0,
    );
  }

  page(packets, headerType) {
    // 各パケットを 255 バイトずつの区切りで表す（ちょうど割り切れるときは長さ 0 の区切りを足す）
    const lacing = [];
    for (const p of packets) {
      let n = p.length;
      for (; n >= 255; n -= 255) lacing.push(255);
      lacing.push(n);
    }
    if (lacing.length > 255) throw new Error("Ogg page too large");
    const bodyLength = packets.reduce((sum, p) => sum + p.length, 0);
    const buf = new Uint8Array(27 + lacing.length + bodyLength);
    const v = new DataView(buf.buffer);
    buf.set(ascii("OggS"));
    buf[4] = 0; // バージョン
    buf[5] = headerType;
    v.setBigUint64(6, BigInt(headerType & 0x02 ? 0 : this.granule), true);
    v.setUint32(14, this.serial, true);
    v.setUint32(18, this.sequence++, true);
    buf[26] = lacing.length;
    buf.set(lacing, 27);
    let offset = 27 + lacing.length;
    for (const p of packets) {
      buf.set(p, offset);
      offset += p.length;
    }
    v.setUint32(22, oggCrc(buf), true);
    return buf;
  }
}

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// Ogg のチェックサム（多項式 0x04C11DB7、初期値 0、反転なし）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(bytes) {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  return crc;
}

// ---- μ-law（G.711） ----------------------------------------------------------
export function mulawEncode(pcm) {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let s = pcm[i];
    const sign = s < 0 ? 0x80 : 0;
    if (s < 0) s = -s;
    if (s > 32635) s = 32635;
    s += 0x84;
    let exponent = 7;
    for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
    const mantissa = (s >> (exponent + 3)) & 0x0f;
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff;
  }
  return out;
}
