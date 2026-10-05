// マイク音声を 16kHz 前後・16bit PCM に変換して約100msごとにメインスレッドへ送る。
// MediaRecorder の形式はブラウザごとに違う（iPhone の Safari は mp4）ため、生のPCMで送る。
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = options.processorOptions.ratio;
    this.size = Math.round(sampleRate / this.ratio / 10);
    this.chunk = new Int16Array(this.size);
    this.filled = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      // ratio 個ずつ平均して間引く（簡易ローパス）
      this.sum += channel[i];
      if (++this.count < this.ratio) continue;
      const v = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.chunk[this.filled++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.filled === this.size) {
        // 転送するとバッファは切り離される（length が 0 になる）ので、新しく作り直す
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(this.size);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
