export type VideoCodecChoice = "avc" | "hevc" | "vp9" | "av1";
export type AudioCodecChoice = "aac" | "opus";
export type QualityPreset = "very-low" | "low" | "medium" | "high" | "very-high";
export type Mp4Layout = "in-memory" | "fragmented" | "none";
export type HardwareAcceleration =
  | "no-preference"
  | "prefer-hardware"
  | "prefer-software";

export type TransportConfig = {
  /** Files above this size use multipart; `always` still sends files <=5MB as a single part. */
  multipartThresholdMB: number | "always" | "never";
  /** S3 requires >=5MB for every part except the last. */
  partSizeMB: number;
  concurrency: number;
  retryDelaysMs: number[];
  /** Per-part XHR timeout; null = no timeout. */
  partTimeoutMs: number | null;
  /** Presigned part URL lifetime; null = server default. Only honored for sandbox keys. */
  signExpiresSec: number | null;
};

export type VideoConfig = {
  enabled: boolean;
  minSizeMB: number;
  /** Longest output side in px; null keeps the original resolution. */
  maxLongEdge: number | null;
  codec: VideoCodecChoice;
  /** Bits per second, or a Mediabunny quality preset. */
  bitrate: number | QualityPreset;
  maxFrameRate: number | null;
  keyFrameIntervalSec: number;
  mp4Layout: Mp4Layout;
  audio: {
    codec: AudioCodecChoice;
    bitrate: number;
    drop: boolean;
  };
  hardwareAcceleration: HardwareAcceleration;
  /** Give up if the projected encode time exceeds max(minTimeBudgetSec, multiplier x duration). */
  timeBudgetMultiplier: number;
  minTimeBudgetSec: number;
  useWorker: boolean;
};

export type ImageConfig = {
  enabled: boolean;
  minSizeMB: number;
  maxLongEdge: number;
  format: "jpeg" | "webp";
  quality: number;
};

export type PosterConfig = {
  enabled: boolean;
  atSec: number;
  width: number;
  quality: number;
  timeoutMs: number;
};

export type UploadConfig = {
  transport: TransportConfig;
  video: VideoConfig;
  image: ImageConfig;
  poster: PosterConfig;
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export const PRODUCTION_UPLOAD_CONFIG: UploadConfig = {
  transport: {
    multipartThresholdMB: "always",
    partSizeMB: 5,
    concurrency: 6,
    retryDelaysMs: [0, 1000, 3000, 5000],
    partTimeoutMs: null,
    signExpiresSec: null,
  },
  video: {
    enabled: true,
    minSizeMB: 8,
    maxLongEdge: 854,
    codec: "avc",
    bitrate: 1_200_000,
    maxFrameRate: 30,
    keyFrameIntervalSec: 2,
    mp4Layout: "in-memory",
    audio: {
      codec: "aac",
      bitrate: 128_000,
      drop: false,
    },
    hardwareAcceleration: "no-preference",
    timeBudgetMultiplier: 1.5,
    minTimeBudgetSec: 45,
    useWorker: true,
  },
  image: {
    enabled: true,
    minSizeMB: 0.5,
    maxLongEdge: 2048,
    format: "jpeg",
    quality: 0.82,
  },
  poster: {
    enabled: true,
    atSec: 1,
    width: 640,
    quality: 0.8,
    timeoutMs: 8000,
  },
};

const VIDEO_CODECS: readonly VideoCodecChoice[] = ["avc", "hevc", "vp9", "av1"];
const AUDIO_CODECS: readonly AudioCodecChoice[] = ["aac", "opus"];
const QUALITY_PRESETS: readonly QualityPreset[] = [
  "very-low",
  "low",
  "medium",
  "high",
  "very-high",
];
const MP4_LAYOUTS: readonly Mp4Layout[] = ["in-memory", "fragmented", "none"];
const HW_ACCEL: readonly HardwareAcceleration[] = [
  "no-preference",
  "prefer-hardware",
  "prefer-software",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v != null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function nullableNum(
  v: unknown,
  fallback: number | null,
  min: number,
  max: number,
): number | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function oneOf<T extends string>(
  v: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return typeof v === "string" && (options as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

/**
 * Applies partial overrides (e.g. HuntSettings.uploadConfig JSON) on top of `base`.
 * Unknown keys are dropped and invalid values fall back to `base`, so a bad
 * override can never produce an unusable config.
 */
export function mergeUploadConfig(
  base: UploadConfig,
  overrides: unknown,
): UploadConfig {
  const o = obj(overrides);
  const t = obj(o.transport);
  const v = obj(o.video);
  const va = obj(v.audio);
  const i = obj(o.image);
  const p = obj(o.poster);
  const bt = base.transport;
  const bv = base.video;
  const bi = base.image;
  const bp = base.poster;

  let threshold = bt.multipartThresholdMB;
  if (t.multipartThresholdMB === "always" || t.multipartThresholdMB === "never") {
    threshold = t.multipartThresholdMB;
  } else if (typeof t.multipartThresholdMB === "number") {
    threshold = num(t.multipartThresholdMB, 0, 0, 5 * 1024);
  }

  let retryDelaysMs = bt.retryDelaysMs;
  if (
    Array.isArray(t.retryDelaysMs) &&
    t.retryDelaysMs.every((d) => typeof d === "number" && Number.isFinite(d))
  ) {
    retryDelaysMs = (t.retryDelaysMs as number[])
      .slice(0, 20)
      .map((d) => Math.min(300_000, Math.max(0, d)));
  }

  let bitrate = bv.bitrate;
  if (typeof v.bitrate === "number") {
    bitrate = num(
      v.bitrate,
      typeof bv.bitrate === "number" ? bv.bitrate : 1_200_000,
      100_000,
      50_000_000,
    );
  } else if (typeof v.bitrate === "string") {
    bitrate = oneOf(v.bitrate, QUALITY_PRESETS, "medium");
  }

  return {
    transport: {
      multipartThresholdMB: threshold,
      partSizeMB: num(t.partSizeMB, bt.partSizeMB, 5, 512),
      concurrency: Math.round(num(t.concurrency, bt.concurrency, 1, 20)),
      retryDelaysMs,
      partTimeoutMs: nullableNum(t.partTimeoutMs, bt.partTimeoutMs, 1000, 3_600_000),
      signExpiresSec: nullableNum(t.signExpiresSec, bt.signExpiresSec, 1, 7 * 24 * 3600),
    },
    video: {
      enabled: bool(v.enabled, bv.enabled),
      minSizeMB: num(v.minSizeMB, bv.minSizeMB, 0, 10_000),
      maxLongEdge: nullableNum(v.maxLongEdge, bv.maxLongEdge, 144, 7680),
      codec: oneOf(v.codec, VIDEO_CODECS, bv.codec),
      bitrate,
      maxFrameRate: nullableNum(v.maxFrameRate, bv.maxFrameRate, 1, 240),
      keyFrameIntervalSec: num(v.keyFrameIntervalSec, bv.keyFrameIntervalSec, 0.1, 60),
      mp4Layout: oneOf(v.mp4Layout, MP4_LAYOUTS, bv.mp4Layout),
      audio: {
        codec: oneOf(va.codec, AUDIO_CODECS, bv.audio.codec),
        bitrate: num(va.bitrate, bv.audio.bitrate, 16_000, 512_000),
        drop: bool(va.drop, bv.audio.drop),
      },
      hardwareAcceleration: oneOf(
        v.hardwareAcceleration,
        HW_ACCEL,
        bv.hardwareAcceleration,
      ),
      timeBudgetMultiplier: num(v.timeBudgetMultiplier, bv.timeBudgetMultiplier, 0.1, 100),
      minTimeBudgetSec: num(v.minTimeBudgetSec, bv.minTimeBudgetSec, 1, 3600),
      useWorker: bool(v.useWorker, bv.useWorker),
    },
    image: {
      enabled: bool(i.enabled, bi.enabled),
      minSizeMB: num(i.minSizeMB, bi.minSizeMB, 0, 10_000),
      maxLongEdge: num(i.maxLongEdge, bi.maxLongEdge, 64, 16_384),
      format: oneOf(i.format, ["jpeg", "webp"] as const, bi.format),
      quality: num(i.quality, bi.quality, 0.1, 1),
    },
    poster: {
      enabled: bool(p.enabled, bp.enabled),
      atSec: num(p.atSec, bp.atSec, 0, 3600),
      width: num(p.width, bp.width, 64, 4096),
      quality: num(p.quality, bp.quality, 0.1, 1),
      timeoutMs: num(p.timeoutMs, bp.timeoutMs, 1000, 60_000),
    },
  };
}

/** Uppy chunk size in bytes for this config. */
export function partSizeBytes(config: UploadConfig): number {
  return Math.max(5, config.transport.partSizeMB) * 1024 * 1024;
}

export function shouldUseMultipartFor(config: UploadConfig, sizeBytes: number): boolean {
  const threshold = config.transport.multipartThresholdMB;
  if (threshold === "always") return true;
  if (threshold === "never") return false;
  return sizeBytes > threshold * 1024 * 1024;
}
