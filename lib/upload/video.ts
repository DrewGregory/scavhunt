import {
  ALL_FORMATS,
  BlobSource,
  BufferSource as MbBufferSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
  type ConversionAudioOptions,
  type InputAudioTrack,
  type Source,
} from "mediabunny";
import type { VideoConfig } from "./config";

// Mediabunny-backed video helpers. Runs unchanged on the main thread or inside
// compress.worker.ts, so it must not touch the DOM.

export type SkipReason =
  | "unsupported"
  | "disabled"
  | "too_small"
  | "too_slow"
  | "not_smaller"
  | "user"
  | "error";

export type MediaInfo = {
  kind: "video" | "image" | "other";
  codec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  durationSec: number | null;
  /** Overall bits per second (file size / duration). */
  bitrate: number | null;
  sizeBytes: number;
  mimeType: string;
};

export type TranscodeOutcome =
  | { ok: true; buffer: ArrayBuffer; input: MediaInfo; output: MediaInfo }
  | { ok: false; reason: SkipReason; message?: string; input: MediaInfo | null };

async function describe(
  input: Input<Source>,
  sizeBytes: number,
  mimeType: string,
): Promise<MediaInfo> {
  const [video, audio] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);
  const durationSec = await input.computeDuration().catch(() => null);
  const fps = video
    ? await video
        .computePacketStats(120)
        .then((s) => s.averagePacketRate)
        .catch(() => null)
    : null;
  return {
    kind: video ? "video" : "other",
    codec: video ? await video.getCodec() : null,
    audioCodec: audio ? await audio.getCodec() : null,
    width: video ? await video.getDisplayWidth() : null,
    height: video ? await video.getDisplayHeight() : null,
    fps: fps && Number.isFinite(fps) ? Math.round(fps * 100) / 100 : null,
    durationSec: durationSec && Number.isFinite(durationSec) ? durationSec : null,
    bitrate:
      durationSec && durationSec > 0 && Number.isFinite(durationSec)
        ? Math.round((sizeBytes * 8) / durationSec)
        : null,
    sizeBytes,
    mimeType: mimeType || (await input.getMimeType().catch(() => "")),
  };
}

export async function inspectVideo(blob: Blob): Promise<MediaInfo> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    return await describe(input, blob.size, blob.type);
  } finally {
    input.dispose();
  }
}

function toQuality(bitrate: VideoConfig["bitrate"]): Quality {
  // Quantizer-driven presets stalled Chrome's encoder in testing; map them to bitrates.
  return typeof bitrate === "number"
    ? new Quality({ bitrate })
    : new Quality({ quality: bitrate, preferBitrate: true });
}

function targetSize(
  width: number,
  height: number,
  maxLongEdge: number | null,
): { width?: number; height?: number; checkWidth: number; checkHeight: number } {
  const longEdge = Math.max(width, height);
  if (!maxLongEdge || longEdge <= maxLongEdge) {
    return { checkWidth: width, checkHeight: height };
  }
  const scale = maxLongEdge / longEdge;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const checkWidth = even(width * scale);
  const checkHeight = even(height * scale);
  // Only one side is passed to Mediabunny so it keeps the exact aspect ratio.
  return width >= height
    ? { width: checkWidth, checkWidth, checkHeight }
    : { height: checkHeight, checkWidth, checkHeight };
}

function audioOptions(cfg: VideoConfig) {
  return async (track: InputAudioTrack): Promise<ConversionAudioOptions> => {
    if (cfg.audio.drop) return { discard: true };
    const target = cfg.audio.codec;
    const source = await track.getCodec();
    const sourceBitrate =
      (await track.getAverageBitrate()) ?? (await track.getBitrate());
    if (
      source === target &&
      (sourceBitrate == null || sourceBitrate <= cfg.audio.bitrate * 1.25)
    ) {
      return { codec: target };
    }
    const numberOfChannels = Math.min(2, await track.getNumberOfChannels());
    const sampleRate = target === "opus" ? 48_000 : await track.getSampleRate();
    const quality = new Quality({ bitrate: cfg.audio.bitrate });
    const encodable = await canEncodeAudio(target, {
      numberOfChannels,
      sampleRate,
      quality,
    }).catch(() => false);
    if (encodable) {
      return {
        codec: target,
        quality,
        numberOfChannels,
        ...(target === "opus" ? { sampleRate } : {}),
      };
    }
    // Copying beats dropping audio when the encoder is missing (e.g. no AudioEncoder).
    if (source === target) return { codec: target };
    // Leads to a `no_encodable_target_codec` discard, which the caller treats as unsupported.
    return { codec: target, quality };
  };
}

export async function transcodeVideo(
  blob: Blob,
  cfg: VideoConfig,
  opts: { onProgress?: (progress: number) => void; signal?: AbortSignal } = {},
): Promise<TranscodeOutcome> {
  const startedAt = performance.now();
  const { signal, onProgress } = opts;
  if (signal?.aborted) return { ok: false, reason: "user", input: null };

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  let info: MediaInfo | null = null;
  try {
    if (!(await input.canRead())) {
      return { ok: false, reason: "unsupported", message: "unreadable container", input: null };
    }
    info = await describe(input, blob.size, blob.type);
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || info.width == null || info.height == null) {
      return { ok: false, reason: "unsupported", message: "no video track", input: info };
    }

    const size = targetSize(info.width, info.height, cfg.maxLongEdge);
    const quality = toQuality(cfg.bitrate);
    const frameRate =
      cfg.maxFrameRate && info.fps && info.fps > cfg.maxFrameRate + 0.5
        ? cfg.maxFrameRate
        : undefined;

    const encodable = await canEncodeVideo(cfg.codec, {
      width: size.checkWidth,
      height: size.checkHeight,
      quality,
      frameRate: frameRate ?? info.fps ?? undefined,
      hardwareAcceleration: cfg.hardwareAcceleration,
    }).catch(() => false);
    if (!encodable) {
      return {
        ok: false,
        reason: "unsupported",
        message: `cannot encode ${cfg.codec} ${size.checkWidth}x${size.checkHeight}`,
        input: info,
      };
    }

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: cfg.mp4Layout === "none" ? false : cfg.mp4Layout,
      }),
      target,
    });

    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        codec: cfg.codec,
        width: size.width,
        height: size.height,
        quality,
        frameRate,
        keyFrameInterval: cfg.keyFrameIntervalSec,
        hardwareAcceleration: cfg.hardwareAcceleration,
      },
      audio: audioOptions(cfg),
    });

    const discarded = conversion.discardedTracks.filter(
      (d) => d.reason !== "discarded_by_user",
    );
    if (!conversion.isValid || discarded.length > 0) {
      return {
        ok: false,
        reason: "unsupported",
        message:
          discarded.map((d) => `${d.track.type}:${d.reason}`).join(",") ||
          "invalid conversion",
        input: info,
      };
    }

    const durationSec = info.durationSec ?? 0;
    const budgetMs =
      Math.max(cfg.minTimeBudgetSec, cfg.timeBudgetMultiplier * durationSec) * 1000;
    let cancelReason: SkipReason | null = null;
    const cancel = (reason: SkipReason) => {
      if (cancelReason) return;
      cancelReason = reason;
      void conversion.cancel();
    };
    const onAbort = () => cancel("user");
    signal?.addEventListener("abort", onAbort);
    const hardStop = setTimeout(
      () => cancel("too_slow"),
      Math.max(0, budgetMs - (performance.now() - startedAt)),
    );
    conversion.onProgress = (progress) => {
      onProgress?.(progress);
      const elapsed = performance.now() - startedAt;
      if (progress > 0.02 && elapsed > 3000 && elapsed / progress > budgetMs) {
        cancel("too_slow");
      }
    };

    try {
      if (signal?.aborted) cancel("user");
      else await conversion.execute();
    } catch (err) {
      if (cancelReason) return { ok: false, reason: cancelReason, input: info };
      if (err instanceof ConversionCanceledError) {
        return { ok: false, reason: "user", input: info };
      }
      throw err;
    } finally {
      clearTimeout(hardStop);
      signal?.removeEventListener("abort", onAbort);
    }
    if (cancelReason) return { ok: false, reason: cancelReason, input: info };

    const buffer = target.buffer;
    if (!buffer) {
      return { ok: false, reason: "error", message: "empty output", input: info };
    }
    const outInput = new Input({
      source: new MbBufferSource(buffer),
      formats: ALL_FORMATS,
    });
    let outInfo: MediaInfo;
    try {
      outInfo = await describe(outInput, buffer.byteLength, "video/mp4");
    } finally {
      outInput.dispose();
    }
    return { ok: true, buffer, input: info, output: outInfo };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
      input: info,
    };
  } finally {
    input.dispose();
  }
}
