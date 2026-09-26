import type { ImageConfig, UploadConfig, VideoConfig } from "./config";
import type { MediaInfo, SkipReason, TranscodeOutcome } from "./video";
import type { WorkerRequest, WorkerResponse } from "./compress.worker";

export type { MediaInfo, SkipReason };

export type CompressResult = {
  /** The file to upload: the compressed output, or the original input. */
  file: File;
  compressed: boolean;
  skippedReason?: SkipReason;
  errorMessage?: string;
  input: MediaInfo;
  output: MediaInfo;
  compressMs: number;
  /** Seconds of video processed per wall-clock second; null when nothing was encoded. */
  realtimeFactor: number | null;
  usedWorker: boolean;
};

export type CompressOptions = {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

const MB = 1024 * 1024;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|3g2|avi|qt)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|avif|bmp)$/i;

export function mediaKind(file: { type?: string; name?: string }): MediaInfo["kind"] {
  const type = file.type ?? "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  const name = file.name ?? "";
  if (VIDEO_EXT.test(name)) return "video";
  if (IMAGE_EXT.test(name)) return "image";
  return "other";
}

function basicInfo(file: File, kind = mediaKind(file)): MediaInfo {
  return {
    kind,
    codec: null,
    audioCodec: null,
    width: null,
    height: null,
    fps: null,
    durationSec: null,
    bitrate: null,
    sizeBytes: file.size,
    mimeType: file.type,
  };
}

export function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base || "upload"}.${ext}`;
}

/** Container, codec, dimensions, fps and duration of a local file. Never throws. */
export async function inspectMedia(file: File): Promise<MediaInfo> {
  const kind = mediaKind(file);
  if (typeof window === "undefined") return basicInfo(file, kind);
  try {
    if (kind === "video") {
      const { inspectVideo } = await import("./video");
      const info = await inspectVideo(file);
      return { ...info, kind: "video", mimeType: file.type || info.mimeType };
    }
    if (kind === "image") {
      const bitmap = await createImageBitmap(file);
      const info: MediaInfo = {
        ...basicInfo(file, kind),
        codec: file.type || null,
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();
      return info;
    }
  } catch {
    // fall through to size/type only
  }
  return basicInfo(file, kind);
}

export async function compressFile(
  file: File,
  config: UploadConfig,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const startedAt = performance.now();
  const kind = mediaKind(file);
  const finish = async (
    partial: Partial<CompressResult> & { skippedReason?: SkipReason },
  ): Promise<CompressResult> => {
    const input = partial.input ?? (await inspectMedia(file));
    return {
      file,
      compressed: false,
      output: input,
      compressMs: performance.now() - startedAt,
      realtimeFactor: null,
      usedWorker: false,
      ...partial,
      input,
    };
  };

  if (typeof window === "undefined") return finish({ skippedReason: "unsupported" });
  try {
    if (kind === "video") return await compressVideo(file, config.video, opts, startedAt, finish);
    if (kind === "image") return await compressImage(file, config.image, opts, finish);
    return await finish({ skippedReason: "unsupported" });
  } catch (err) {
    return finish({
      skippedReason: opts.signal?.aborted ? "user" : "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

type Finish = (
  partial: Partial<CompressResult> & { skippedReason?: SkipReason },
) => Promise<CompressResult>;

async function compressVideo(
  file: File,
  cfg: VideoConfig,
  opts: CompressOptions,
  startedAt: number,
  finish: Finish,
): Promise<CompressResult> {
  if (!cfg.enabled) return finish({ skippedReason: "disabled" });
  if (file.size < cfg.minSizeMB * MB) return finish({ skippedReason: "too_small" });
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return finish({ skippedReason: "unsupported", errorMessage: "WebCodecs unavailable" });
  }

  let usedWorker = false;
  let outcome: TranscodeOutcome;
  if (cfg.useWorker && typeof Worker !== "undefined") {
    try {
      outcome = await runInWorker(file, cfg, opts);
      usedWorker = true;
    } catch (err) {
      if (!(err instanceof WorkerStartError)) throw err;
      outcome = await runOnMainThread(file, cfg, opts);
    }
  } else {
    outcome = await runOnMainThread(file, cfg, opts);
  }

  if (!outcome.ok) {
    return finish({
      skippedReason: outcome.reason,
      errorMessage: outcome.message,
      usedWorker,
      ...(outcome.input ? { input: outcome.input } : {}),
    });
  }

  const compressMs = performance.now() - startedAt;
  const durationSec = outcome.input.durationSec ?? outcome.output.durationSec;
  const realtimeFactor =
    durationSec && compressMs > 0 ? durationSec / (compressMs / 1000) : null;
  if (outcome.buffer.byteLength >= file.size) {
    return finish({
      skippedReason: "not_smaller",
      input: outcome.input,
      usedWorker,
      compressMs,
      realtimeFactor,
    });
  }
  const out = new File([outcome.buffer], replaceExtension(file.name, "mp4"), {
    type: "video/mp4",
    lastModified: file.lastModified,
  });
  return {
    file: out,
    compressed: true,
    input: outcome.input,
    output: { ...outcome.output, kind: "video", mimeType: "video/mp4" },
    compressMs,
    realtimeFactor,
    usedWorker,
  };
}

async function runOnMainThread(
  file: File,
  cfg: VideoConfig,
  opts: CompressOptions,
): Promise<TranscodeOutcome> {
  const { transcodeVideo } = await import("./video");
  return transcodeVideo(file, cfg, opts);
}

/** The worker failed to load, as opposed to failing mid-transcode. */
class WorkerStartError extends Error {}

function runInWorker(
  file: File,
  cfg: VideoConfig,
  { onProgress, signal }: CompressOptions,
): Promise<TranscodeOutcome> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./compress.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      reject(new WorkerStartError(err instanceof Error ? err.message : String(err)));
      return;
    }
    let ready = false;
    const post = (msg: WorkerRequest) => worker.postMessage(msg);
    const onAbort = () => post({ type: "cancel" });
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        ready = true;
        post({ type: "transcode", file, config: cfg });
      } else if (msg.type === "progress") {
        onProgress?.(msg.progress);
      } else if (msg.type === "result") {
        cleanup();
        resolve(msg.outcome);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      cleanup();
      const message = e.message || "worker error";
      reject(ready ? new Error(message) : new WorkerStartError(message));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

async function encodeCanvas(
  source: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx && "convertToBlob" in canvas) {
      if (type === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(source, 0, 0, width, height);
      return canvas.convertToBlob({ type, quality });
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressImage(
  file: File,
  cfg: ImageConfig,
  opts: CompressOptions,
  finish: Finish,
): Promise<CompressResult> {
  if (!cfg.enabled) return finish({ skippedReason: "disabled" });
  if (/^image\/(gif|svg)/.test(file.type) || /\.(gif|svg)$/i.test(file.name)) {
    return finish({ skippedReason: "unsupported" });
  }
  if (file.size < cfg.minSizeMB * MB) return finish({ skippedReason: "too_small" });

  const bitmap = await createImageBitmap(file);
  const input: MediaInfo = {
    ...basicInfo(file, "image"),
    codec: file.type || null,
    width: bitmap.width,
    height: bitmap.height,
  };
  try {
    const scale = Math.min(1, cfg.maxLongEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    opts.onProgress?.(0.5);

    let type = `image/${cfg.format}`;
    let blob = await encodeCanvas(bitmap, width, height, type, cfg.quality);
    // Browsers without a WebP encoder silently return PNG.
    if (blob && blob.type !== type) {
      type = "image/jpeg";
      blob = await encodeCanvas(bitmap, width, height, type, cfg.quality);
    }
    if (opts.signal?.aborted) return finish({ skippedReason: "user", input });
    if (!blob || blob.type !== type) {
      return finish({ skippedReason: "unsupported", errorMessage: "canvas encode failed", input });
    }
    opts.onProgress?.(1);
    if (blob.size >= file.size) return finish({ skippedReason: "not_smaller", input });

    const out = new File([blob], replaceExtension(file.name, type === "image/webp" ? "webp" : "jpg"), {
      type,
      lastModified: file.lastModified,
    });
    return {
      ...(await finish({ input })),
      file: out,
      compressed: true,
      output: { ...input, codec: type, width, height, sizeBytes: out.size, mimeType: type },
    };
  } finally {
    bitmap.close();
  }
}
