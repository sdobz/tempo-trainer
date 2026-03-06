import FFT from "npm:fft.js@4.0.4";

export type MockAudioSource = {
  analyserNode: ReplayAnalyserNode;
  audioContext: { currentTime: number };
  durationSeconds: number;
  start: (options?: { fftSize?: number }) => Promise<ReplayAnalyserNode>;
  stop: () => void;
};

export type MockDetectorDelegateSnapshot = {
  levels: number[];
  peaks: number[];
  thresholds: number[];
  hitCount: number;
};

export class ReplayAnalyserNode {
  private readonly samples: Float32Array;
  private readonly sampleRate: number;
  private readonly audioContext: { currentTime: number };
  private readonly minDb: number;
  private readonly maxDb: number;
  private readonly fftBySize = new Map<number, FFT>();
  private readonly complexBySize = new Map<
    number,
    { inBuf: number[]; outBuf: number[] }
  >();

  fftSize: number;
  frequencyBinCount: number;

  constructor(options: {
    samples: Float32Array;
    sampleRate: number;
    audioContext: { currentTime: number };
    fftSize: number;
    minDb?: number;
    maxDb?: number;
  }) {
    this.samples = options.samples;
    this.sampleRate = options.sampleRate;
    this.audioContext = options.audioContext;
    this.fftSize = options.fftSize;
    this.frequencyBinCount = Math.floor(options.fftSize / 2);
    this.minDb = options.minDb ?? -90;
    this.maxDb = options.maxDb ?? -30;
  }

  connect() {}
  disconnect() {}

  private getCursorSample() {
    return Math.floor(this.audioContext.currentTime * this.sampleRate);
  }

  private readSample(index: number) {
    if (index < 0 || index >= this.samples.length) return 0;
    return this.samples[index];
  }

  private getFftState(size: number) {
    let fft = this.fftBySize.get(size);
    let buffers = this.complexBySize.get(size);

    if (!fft || !buffers) {
      fft = new FFT(size);
      buffers = {
        inBuf: fft.createComplexArray() as unknown as number[],
        outBuf: fft.createComplexArray() as unknown as number[],
      };
      this.fftBySize.set(size, fft);
      this.complexBySize.set(size, buffers);
    }

    return { fft, buffers };
  }

  getByteTimeDomainData(target: Uint8Array) {
    const cursor = this.getCursorSample();
    const start = cursor - target.length;

    for (let i = 0; i < target.length; i++) {
      target[i] = floatToByte(this.readSample(start + i));
    }
  }

  getByteFrequencyData(target: Uint8Array) {
    const fftSize = this.fftSize;
    const { fft, buffers } = this.getFftState(fftSize);

    const cursor = this.getCursorSample();
    const start = cursor - fftSize;
    const windowDenom = Math.max(1, fftSize - 1);

    for (let i = 0; i < fftSize; i++) {
      const x = this.readSample(start + i);
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / windowDenom));
      buffers.inBuf[i * 2] = x * window;
      buffers.inBuf[i * 2 + 1] = 0;
    }

    fft.transform(buffers.outBuf, buffers.inBuf);

    const binCount = Math.min(target.length, Math.floor(fftSize / 2));
    for (let i = 0; i < binCount; i++) {
      const re = buffers.outBuf[i * 2];
      const im = buffers.outBuf[i * 2 + 1];
      const amp = Math.hypot(re, im) / fftSize;
      const db = 20 * Math.log10(amp + 1e-12);
      const normalized = Math.round(
        ((clamp(db, this.minDb, this.maxDb) - this.minDb) /
          (this.maxDb - this.minDb)) *
          255,
      );
      target[i] = clamp(normalized, 0, 255);
    }

    for (let i = binCount; i < target.length; i++) {
      target[i] = 0;
    }
  }
}

export async function createMockAudioSourceFromWav(
  wavUrl: URL | string,
  options: { fftSize: number; minDb?: number; maxDb?: number },
): Promise<MockAudioSource> {
  const wav = await readWavMono(wavUrl);
  const audioContext = { currentTime: 0 };
  const analyserNode = new ReplayAnalyserNode({
    samples: wav.samples,
    sampleRate: wav.sampleRate,
    audioContext,
    fftSize: options.fftSize,
    minDb: options.minDb,
    maxDb: options.maxDb,
  });

  return {
    analyserNode,
    audioContext,
    durationSeconds: wav.samples.length / wav.sampleRate,
    async start(startOptions = {}) {
      if (typeof startOptions.fftSize === "number") {
        analyserNode.fftSize = startOptions.fftSize;
        analyserNode.frequencyBinCount = Math.floor(startOptions.fftSize / 2);
      }
      return analyserNode;
    },
    stop() {},
  };
}

export function createMockDetectorDelegate() {
  const levels: number[] = [];
  const peaks: number[] = [];
  const thresholds: number[] = [];
  let hitCount = 0;

  return {
    delegate: {
      onLevelChanged(level: number) {
        levels.push(level);
      },
      onPeakChanged(peak: number) {
        peaks.push(peak);
      },
      onThresholdChanged(threshold: number) {
        thresholds.push(threshold);
      },
      onHit() {
        hitCount += 1;
      },
    },
    snapshot(): MockDetectorDelegateSnapshot {
      return {
        levels,
        peaks,
        thresholds,
        hitCount,
      };
    },
  };
}

export async function runDetectorLoop(options: {
  detector: {
    start: () => Promise<boolean>;
    stop: () => void;
    onHit: (callback: (hitTime: number) => void) => void;
  };
  audioSource: MockAudioSource;
  rafHz: number;
  startSeconds?: number;
  endSeconds?: number;
}) {
  const hits: number[] = [];

  const sched = globalThis as unknown as {
    requestAnimationFrame?: (callback: (time: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };

  const originalRaf = sched.requestAnimationFrame;
  const originalCancel = sched.cancelAnimationFrame;

  sched.requestAnimationFrame = () => 1;
  sched.cancelAnimationFrame = () => {};

  try {
    options.detector.onHit((hitTime) => hits.push(hitTime));
    await options.detector.start();

    const internals = options.detector as any;
    const startSeconds = options.startSeconds ?? 0;
    const endSeconds =
      options.endSeconds ?? options.audioSource.durationSeconds;
    const frameCount = Math.max(
      1,
      Math.ceil((endSeconds - startSeconds) * options.rafHz),
    );

    let nowMs = startSeconds * 1000;
    internals._now = () => nowMs;

    for (let i = 0; i < frameCount; i++) {
      nowMs = (startSeconds + i / options.rafHz) * 1000;
      options.audioSource.audioContext.currentTime = nowMs / 1000;
      internals._detectLoop();
    }

    options.detector.stop();
    return hits;
  } finally {
    sched.requestAnimationFrame = originalRaf;
    sched.cancelAnimationFrame = originalCancel;
  }
}

export async function readWavMono(fileUrl: URL | string) {
  const url =
    typeof fileUrl === "string" ? new URL(fileUrl, import.meta.url) : fileUrl;
  const bytes = await Deno.readFile(url);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riff = readAscii(dv, 0, 4);
  const wave = readAscii(dv, 8, 4);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Unsupported WAV file: missing RIFF/WAVE header");
  }

  let offset = 12;
  let fmt: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | null = null;
  let dataOffset = -1;
  let dataSize = -1;

  while (offset + 8 <= dv.byteLength) {
    const chunkId = readAscii(dv, offset, 4);
    const chunkSize = dv.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: dv.getUint16(chunkDataOffset, true),
        channels: dv.getUint16(chunkDataOffset + 2, true),
        sampleRate: dv.getUint32(chunkDataOffset + 4, true),
        bitsPerSample: dv.getUint16(chunkDataOffset + 14, true),
      };
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset < 0 || dataSize <= 0) {
    throw new Error("Unsupported WAV file: missing fmt or data chunk");
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameSize = bytesPerSample * fmt.channels;
  const frameCount = Math.floor(dataSize / frameSize);
  const samples = new Float32Array(frameCount);

  let ptr = dataOffset;
  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let ch = 0; ch < fmt.channels; ch++) {
      sum += readSample(dv, ptr, fmt.audioFormat, fmt.bitsPerSample);
      ptr += bytesPerSample;
    }
    samples[frame] = clamp(sum / fmt.channels, -1, 1);
  }

  return {
    sampleRate: fmt.sampleRate,
    samples,
  };
}

export function compareHits(
  actualSeconds: number[],
  expectedSeconds: number[],
  options: {
    toleranceMs: number;
    warmupSeconds?: number;
    startSeconds?: number;
    endSeconds?: number;
  },
) {
  const tol = options.toleranceMs / 1000;
  const warmup = options.warmupSeconds ?? 0;
  const start = options.startSeconds ?? Number.NEGATIVE_INFINITY;
  const end = options.endSeconds ?? Number.POSITIVE_INFINITY;

  const actual = actualSeconds
    .filter((t) => t >= warmup && t >= start && t <= end)
    .sort((a, b) => a - b);
  const expected = expectedSeconds
    .filter((t) => t >= start && t <= end)
    .sort((a, b) => a - b);

  const usedActual = new Set<number>();
  let matched = 0;

  for (const expectedTime of expected) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < actual.length; i++) {
      if (usedActual.has(i)) continue;
      const distance = Math.abs(actual[i] - expectedTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestDistance <= tol) {
      usedActual.add(bestIndex);
      matched += 1;
    }
  }

  const falsePositives = actual.length - matched;
  const falseNegatives = expected.length - matched;
  const precision = actual.length > 0 ? matched / actual.length : 0;
  const recall = expected.length > 0 ? matched / expected.length : 0;

  return {
    actual,
    expected,
    matched,
    falsePositives,
    falseNegatives,
    precision,
    recall,
  };
}

function floatToByte(sample: number) {
  return clamp(Math.round((clamp(sample, -1, 1) + 1) * 127.5), 0, 255);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readAscii(dv: DataView, offset: number, len: number) {
  let s = "";
  for (let i = 0; i < len; i++)
    s += String.fromCharCode(dv.getUint8(offset + i));
  return s;
}

function readSample(
  dv: DataView,
  offset: number,
  audioFormat: number,
  bitsPerSample: number,
) {
  if (audioFormat === 1) {
    if (bitsPerSample === 8) return (dv.getUint8(offset) - 128) / 128;
    if (bitsPerSample === 16) return dv.getInt16(offset, true) / 32768;
    if (bitsPerSample === 24) {
      const b0 = dv.getUint8(offset);
      const b1 = dv.getUint8(offset + 1);
      const b2 = dv.getUint8(offset + 2);
      let intVal = b0 | (b1 << 8) | (b2 << 16);
      if (intVal & 0x800000) intVal |= ~0xffffff;
      return intVal / 8388608;
    }
    if (bitsPerSample === 32) return dv.getInt32(offset, true) / 2147483648;
  }

  if (audioFormat === 3 && bitsPerSample === 32) {
    return dv.getFloat32(offset, true);
  }

  throw new Error(
    `Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}`,
  );
}
