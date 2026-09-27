import { BasePlugin, type PluginOpts, type Uppy } from "@uppy/core";
import type { Body, Meta, UppyFile } from "@uppy/core";
import type { UploadConfig } from "./config";
import { compressFile, mediaKind, type CompressResult } from "./compress";
import { extractPoster, type PosterResult } from "./poster";
import { track, type TelemetryFields } from "../telemetry";

export type ProcessedFile = {
  originalFile: File;
  compress: CompressResult;
  poster: PosterResult | null;
};

export type CompressPluginOpts = PluginOpts & {
  config: UploadConfig;
  /** Shared telemetry fields (attemptId, challengeId, sandbox) for the current attempt. */
  telemetryContext?: (fileId: string) => TelemetryFields;
  onProcessed?: (fileId: string, processed: ProcessedFile) => void;
  /** On a video timeout, wait for `resolveTimeout` instead of uploading the original right away. */
  promptOnTimeout?: boolean;
};

export type TimeoutDecision = "retry" | "original";

/** Each retry multiplies the time budget by this. */
const RETRY_BUDGET_FACTOR = 4;

/** File meta flags honored by the plugin (used by the sandbox for "upload original" runs). */
export type CompressMetaFlags = {
  skipCompression?: boolean;
  skipPoster?: boolean;
};

const PROGRESS_STEP = 0.01;

export default class CompressPlugin<M extends Meta, B extends Body> extends BasePlugin<
  CompressPluginOpts,
  M,
  B
> {
  #results = new Map<string, ProcessedFile>();
  #controllers = new Map<string, AbortController>();
  #pendingTimeouts = new Map<string, (decision: TimeoutDecision) => void>();
  #timeoutListeners = new Set<(fileIds: string[]) => void>();

  constructor(uppy: Uppy<M, B>, opts: CompressPluginOpts) {
    super(uppy, opts);
    this.id = opts.id ?? "ScavCompress";
    this.type = "modifier";
  }

  install() {
    this.uppy.addPreProcessor(this.#prepareUpload);
    this.uppy.on("file-removed", this.#onFileRemoved);
    this.uppy.on("cancel-all", this.#onCancelAll);
  }

  uninstall() {
    this.uppy.removePreProcessor(this.#prepareUpload);
    this.uppy.off("file-removed", this.#onFileRemoved);
    this.uppy.off("cancel-all", this.#onCancelAll);
    this.#onCancelAll();
  }

  /** Stops compressing `fileId`; the original is uploaded instead. */
  skip(fileId: string) {
    this.#controllers.get(fileId)?.abort();
  }

  isCompressing(fileId: string): boolean {
    return this.#controllers.has(fileId);
  }

  getResult(fileId: string): ProcessedFile | undefined {
    return this.#results.get(fileId);
  }

  /** Files whose compression timed out and are waiting on `resolveTimeout`. */
  getPendingTimeouts(): string[] {
    return [...this.#pendingTimeouts.keys()];
  }

  subscribeTimeouts(listener: (fileIds: string[]) => void): () => void {
    this.#timeoutListeners.add(listener);
    return () => this.#timeoutListeners.delete(listener);
  }

  resolveTimeout(fileId: string, decision: TimeoutDecision) {
    const resolve = this.#pendingTimeouts.get(fileId);
    if (!resolve) return;
    this.#pendingTimeouts.delete(fileId);
    this.#emitTimeouts();
    resolve(decision);
  }

  #emitTimeouts() {
    const ids = this.getPendingTimeouts();
    for (const listener of this.#timeoutListeners) listener(ids);
  }

  #awaitTimeoutDecision(id: string): Promise<TimeoutDecision> {
    return new Promise((resolve) => {
      this.#pendingTimeouts.set(id, resolve);
      this.#emitTimeouts();
    });
  }

  #onFileRemoved = (file: UppyFile<M, B>) => {
    this.#controllers.get(file.id)?.abort();
    this.#controllers.delete(file.id);
    this.#results.delete(file.id);
    this.resolveTimeout(file.id, "original");
  };

  #onCancelAll = () => {
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
    for (const id of this.getPendingTimeouts()) this.resolveTimeout(id, "original");
  };

  #telemetry(fileId: string, extra: TelemetryFields): TelemetryFields {
    const ctx = this.opts.telemetryContext?.(fileId) ?? {};
    return { ...ctx, ...extra, meta: { ...ctx.meta, ...extra.meta } };
  }

  #prepareUpload = async (fileIDs: string[]) => {
    for (const id of fileIDs) {
      await this.#processFile(id);
    }
  };

  #exists(id: string): boolean {
    return Boolean(this.uppy.getState().files[id]);
  }

  async #processFile(id: string) {
    const file = this.uppy.getFile(id);
    if (!file || file.isRemote || !file.data || this.#results.has(id)) return;
    const original =
      file.data instanceof File
        ? file.data
        : new File([file.data], file.name, { type: file.type });
    const flags = file.meta as CompressMetaFlags;
    const kind = mediaKind(original);
    let { config } = this.opts;

    let compress: CompressResult;
    let attempt = 1;
    for (;;) {
      const controller = new AbortController();
      this.#controllers.set(id, controller);
      try {
        if (flags.skipCompression || kind === "other") {
          compress = await compressFile(
            original,
            { ...config, video: { ...config.video, enabled: false }, image: { ...config.image, enabled: false } },
            { signal: controller.signal },
          );
        } else {
          track("compress_start", this.#telemetry(id, { originalBytes: original.size, meta: { kind, type: original.type, attempt } }));
          this.uppy.emit("preprocess-progress", this.uppy.getFile(id), {
            mode: "determinate",
            message: kind === "video" ? "Compressing video" : "Compressing photo",
            value: 0,
          });
          let lastValue = 0;
          compress = await compressFile(original, config, {
            signal: controller.signal,
            onProgress: (value) => {
              if (value - lastValue < PROGRESS_STEP || !this.#exists(id)) return;
              lastValue = value;
              this.uppy.emit("preprocess-progress", this.uppy.getFile(id), {
                mode: "determinate",
                message: kind === "video" ? "Compressing video" : "Compressing photo",
                value: Math.min(1, value),
              });
            },
          });
          this.#trackCompress(id, compress);
        }
      } finally {
        this.#controllers.delete(id);
      }

      if (!this.#exists(id)) return;
      if (!this.opts.promptOnTimeout || kind !== "video" || compress.skippedReason !== "too_slow") break;

      this.uppy.emit("preprocess-progress", this.uppy.getFile(id), {
        mode: "indeterminate",
        message: "Compression timed out",
      });
      const decision = await this.#awaitTimeoutDecision(id);
      track("compress_timeout_decision", this.#telemetry(id, { meta: { decision, attempt } }));
      if (decision !== "retry" || !this.#exists(id)) break;
      attempt++;
      config = {
        ...config,
        video: {
          ...config.video,
          timeBudgetMultiplier: config.video.timeBudgetMultiplier * RETRY_BUDGET_FACTOR,
          minTimeBudgetSec: config.video.minTimeBudgetSec * RETRY_BUDGET_FACTOR,
        },
      };
    }

    if (!this.#exists(id)) return;

    if (compress.compressed) {
      const out = compress.file;
      const current = this.uppy.getFile(id);
      this.uppy.setFileState(id, {
        data: out,
        size: out.size,
        name: out.name,
        type: out.type,
        extension: out.name.split(".").pop() ?? "",
        meta: { ...current.meta, name: out.name, type: out.type },
        progress: { ...current.progress, bytesTotal: out.size },
      } as Partial<UppyFile<M, B>>);
    }

    let poster: PosterResult | null = null;
    if (kind === "video" && config.poster.enabled && !flags.skipPoster) {
      this.uppy.emit("preprocess-progress", this.uppy.getFile(id), {
        mode: "indeterminate",
        message: "Preparing preview",
      });
      const posterStarted = performance.now();
      poster = await extractPoster(compress.file, config.poster);
      if (!poster && compress.compressed) {
        poster = await extractPoster(original, config.poster);
      }
      track(
        poster ? "poster_done" : "poster_failed",
        this.#telemetry(id, {
          level: poster ? "info" : "warn",
          durationMs: Math.round(performance.now() - posterStarted),
          bytes: poster?.blob.size,
          meta: poster ? { width: poster.width, height: poster.height } : undefined,
        }),
      );
    }

    if (!this.#exists(id)) return;
    const processed: ProcessedFile = { originalFile: original, compress, poster };
    this.#results.set(id, processed);
    this.uppy.emit("preprocess-complete", this.uppy.getFile(id));
    this.opts.onProcessed?.(id, processed);
  }

  #trackCompress(id: string, result: CompressResult) {
    const base: TelemetryFields = {
      durationMs: Math.round(result.compressMs),
      bytes: result.file.size,
      originalBytes: result.input.sizeBytes,
      meta: {
        input: result.input,
        output: result.output,
        realtimeFactor: result.realtimeFactor,
        usedWorker: result.usedWorker,
      },
    };
    if (result.compressed) {
      track("compress_done", this.#telemetry(id, base));
    } else if (result.skippedReason === "error") {
      track(
        "compress_failed",
        this.#telemetry(id, { ...base, level: "error", errorMessage: result.errorMessage }),
      );
    } else {
      track(
        "compress_skipped",
        this.#telemetry(id, {
          ...base,
          errorCode: result.skippedReason,
          errorMessage: result.errorMessage,
          meta: { ...base.meta, reason: result.skippedReason },
        }),
      );
    }
  }
}
