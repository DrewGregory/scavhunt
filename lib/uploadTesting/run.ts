import type { Meta } from "@uppy/core";
import type { UploadConfig } from "../upload/config";
import type { CompressResult } from "../upload/compress";
import type { ProcessedFile } from "../upload/compressPlugin";
import { createUploader, type PartEvent } from "../upload/uppyConfig";
import {
  runDownloadSuite,
  withPeakMemory,
  type DownloadSuite,
  type MemorySample,
} from "./benchmarks";
import type { TimedLifecycleEvent } from "./metrics";
import * as dbg from "./debug";

export type ChaosSettings = {
  signFailPct: number;
  putFailPct: number;
  pauseEnabled: boolean;
  pauseAtPct: number;
  pauseSec: number;
  offlineEnabled: boolean;
  offlineAtPct: number;
  offlineSec: number;
  retryAllAfterOffline: boolean;
};

export const NO_CHAOS: ChaosSettings = {
  signFailPct: 0,
  putFailPct: 0,
  pauseEnabled: false,
  pauseAtPct: 40,
  pauseSec: 10,
  offlineEnabled: false,
  offlineAtPct: 60,
  offlineSec: 15,
  retryAllAfterOffline: true,
};

export type UploadLabel = "compressed" | "original";

export type UploadRunResult = {
  label: UploadLabel;
  ok: boolean;
  error?: string;
  key: string | null;
  cdnUrl: string | null;
  bytes: number;
  /** performance.now() when bytes started moving (after compression). */
  startT: number;
  endT: number;
  partEvents: PartEvent[];
  lifecycle: TimedLifecycleEvent[];
  stalls: number;
  resumes: number;
  chaosLog: string[];
  processed: ProcessedFile | null;
  posterUrl: string | null;
  posterKey: string | null;
};

export type RunCallbacks = {
  onPhase?: (phase: string) => void;
  onCompressProgress?: (value: number) => void;
  onUploadProgress?: (label: UploadLabel, fraction: number) => void;
  /** Called once compression can be skipped; invoke the argument to skip. */
  onSkipAvailable?: (skip: (() => void) | null) => void;
  onPartEvent?: (label: UploadLabel, e: PartEvent) => void;
  /** Fired as soon as the preprocess step finishes (before bytes hit the network). */
  onCompressed?: (processed: ProcessedFile) => void;
};

export type UploadOnceOptions = RunCallbacks & {
  file: File;
  config: UploadConfig;
  runId: string;
  label: UploadLabel;
  chaos: ChaosSettings;
  signal?: AbortSignal;
};

export async function uploadOnce(opts: UploadOnceOptions): Promise<UploadRunResult> {
  const { file, config, runId, label, chaos } = opts;
  const partEvents: PartEvent[] = [];
  const lifecycle: TimedLifecycleEvent[] = [];
  const chaosLog: string[] = [];
  let processed: ProcessedFile | null = null;
  let startT: number | null = null;
  let stalls = 0;
  let resumes = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let lastPct = -1;
  let lastPctAt = performance.now();
  let stallWarned = false;

  dbg.info(`uploadOnce start [${label}]`, {
    runId,
    file: dbg.describeBlob(file),
    transport: config.transport,
    chaos,
  });

  const uploader = createUploader({
    config,
    sandbox: { runId, label },
    autoProceed: false,
    faults:
      chaos.signFailPct > 0 || chaos.putFailPct > 0
        ? { signFailRate: chaos.signFailPct / 100, putFailRate: chaos.putFailPct / 100 }
        : undefined,
    hooks: {
      onPartEvent: (e) => {
        if (startT == null) startT = e.t;
        partEvents.push(e);
        // Log every phase except high-frequency put_progress.
        if (e.phase !== "put_progress") {
          dbg.debug(`part ${e.partNumber} ${e.phase}`, {
            label,
            attempt: e.attempt,
            multipart: e.multipart,
            bytes: e.bytes,
            loaded: e.loaded,
            error: e.error,
            injected: e.injected,
          });
        } else if (e.loaded != null && e.bytes != null && e.bytes > 0) {
          const pct = Math.floor((e.loaded / e.bytes) * 100);
          if (pct >= lastPct + 10 || pct === 100) {
            dbg.debug(`part ${e.partNumber} put_progress ${pct}%`, { loaded: e.loaded, bytes: e.bytes });
          }
        }
        opts.onPartEvent?.(label, e);
      },
      onLifecycle: (e) => {
        if (startT == null && e.step !== "poster_put") startT = performance.now() - e.ms;
        lifecycle.push({ ...e, t: performance.now() });
        dbg.info(`lifecycle ${e.step}`, {
          label,
          ok: e.ok,
          status: e.status,
          ms: Math.round(e.ms),
          error: e.error,
        });
      },
      onProcessed: (_id, p) => {
        processed = p;
        startT = performance.now();
        opts.onSkipAvailable?.(null);
        opts.onPhase?.(`Uploading ${label}`);
        dbg.info(`preprocess done [${label}]`, {
          compressed: p.compress.compressed,
          skippedReason: p.compress.skippedReason,
          errorMessage: p.compress.errorMessage,
          compressMs: Math.round(p.compress.compressMs),
          usedWorker: p.compress.usedWorker,
          input: p.compress.input,
          output: p.compress.output,
          file: dbg.describeBlob(p.compress.file),
          poster: p.poster
            ? { ...dbg.describeBlob(p.poster.blob), width: p.poster.width, height: p.poster.height }
            : null,
        });
        opts.onCompressed?.(p);
      },
    },
  });
  const { uppy } = uploader;

  const onAbort = () => {
    dbg.warn(`abort signal → cancelAll [${label}]`);
    uppy.cancelAll();
  };
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const meta: Meta = label === "original" ? { skipCompression: true, skipPoster: true } : {};
    const fileId = uppy.addFile({ name: file.name, type: file.type, data: file, source: "sandbox", meta });
    dbg.debug(`uppy file added [${label}]`, { fileId, meta });

    let paused = false;
    let offlined = false;
    uppy.on("preprocess-progress", (f, progress) => {
      if (f?.id === fileId && progress.mode === "determinate") {
        const pct = Math.round(progress.value * 100);
        if (pct % 25 === 0 || pct >= 99) dbg.debug(`compress progress ${pct}%`);
        opts.onCompressProgress?.(progress.value);
      }
    });
    uppy.on("upload-stalled", () => {
      stalls++;
      dbg.warn(`uppy upload-stalled [${label}]`);
    });
    uppy.on("upload-progress", (f, progress) => {
      if (!f || f.id !== fileId || !progress.bytesTotal) return;
      const pct = (progress.bytesUploaded / progress.bytesTotal) * 100;
      const now = performance.now();
      if (Math.floor(pct) !== Math.floor(lastPct)) {
        lastPct = pct;
        lastPctAt = now;
        stallWarned = false;
        if (Math.floor(pct) % 5 === 0 || pct > 95) {
          dbg.info(`upload progress [${label}] ${pct.toFixed(1)}%`, {
            bytesUploaded: progress.bytesUploaded,
            bytesTotal: progress.bytesTotal,
          });
        }
      } else if (!stallWarned && now - lastPctAt > 15000) {
        stallWarned = true;
        dbg.warn(`upload appears stuck [${label}] at ${pct.toFixed(1)}% for ${((now - lastPctAt) / 1000).toFixed(0)}s`, {
          bytesUploaded: progress.bytesUploaded,
          bytesTotal: progress.bytesTotal,
          lastPartEvents: partEvents.slice(-8),
          lastLifecycle: lifecycle.slice(-5),
        });
      }
      opts.onUploadProgress?.(label, pct / 100);
      const at = () => (startT != null ? `${((performance.now() - startT) / 1000).toFixed(1)}s` : "");
      if (chaos.pauseEnabled && !paused && pct >= chaos.pauseAtPct) {
        paused = true;
        chaosLog.push(`${at()} pauseAll at ${pct.toFixed(0)}%`);
        dbg.warn(`chaos pauseAll at ${pct.toFixed(0)}%`);
        uppy.pauseAll();
        timers.push(
          setTimeout(() => {
            chaosLog.push(`${at()} resumeAll after ${chaos.pauseSec}s`);
            resumes++;
            dbg.warn(`chaos resumeAll`);
            uppy.resumeAll();
          }, chaos.pauseSec * 1000),
        );
      }
      if (chaos.offlineEnabled && !offlined && pct >= chaos.offlineAtPct) {
        offlined = true;
        chaosLog.push(`${at()} simulated offline at ${pct.toFixed(0)}%`);
        dbg.warn(`chaos simulated offline at ${pct.toFixed(0)}%`);
        uppy.pauseAll();
        window.dispatchEvent(new Event("offline"));
        timers.push(
          setTimeout(() => {
            chaosLog.push(`${at()} online event after ${chaos.offlineSec}s`);
            dbg.warn(`chaos online + resume`);
            window.dispatchEvent(new Event("online"));
            resumes++;
            uppy.resumeAll();
            if (chaos.retryAllAfterOffline) {
              chaosLog.push(`${at()} retryAll`);
              dbg.warn(`chaos retryAll`);
              void uppy.retryAll();
            }
          }, chaos.offlineSec * 1000),
        );
      }
    });

    if (label === "compressed") {
      opts.onPhase?.("Compressing");
      opts.onSkipAvailable?.(() => uploader.compressor.skip(fileId));
    } else {
      opts.onPhase?.(`Uploading ${label}`);
    }

    dbg.info(`calling uppy.upload() [${label}]`);
    const result = await uppy.upload();
    const endT = performance.now();
    const success = result?.successful?.find((f) => f.id === fileId);
    const failed = result?.failed?.find((f) => f.id === fileId);
    const uploaded = uppy.getFile(fileId);

    dbg.info(`uppy.upload() returned [${label}]`, {
      successful: result?.successful?.map((f) => ({ id: f.id, uploadURL: f.uploadURL, size: f.size })),
      failed: result?.failed?.map((f) => ({ id: f.id, error: f.error })),
      processed: Boolean(processed),
      elapsedMs: Math.round(endT - (startT ?? endT)),
    });

    // Belt-and-suspenders: preprocessor may have finished without the hook
    // firing if the plugin remounted mid-run.
    if (!processed) {
      processed = uploader.compressor.getResult(fileId) ?? null;
      dbg.warn(`onProcessed missed; getResult=${Boolean(processed)} [${label}]`);
      if (processed) opts.onCompressed?.(processed);
    }

    let posterUrl: string | null = null;
    const key = uploader.getUploadedKey(fileId) ?? null;
    if (success && label === "compressed" && config.poster.enabled) {
      opts.onPhase?.("Uploading poster");
      dbg.info(`uploading poster [${label}]`, { key });
      posterUrl = await uploader.uploadPoster(fileId);
      dbg.info(`poster done [${label}]`, { posterUrl });
    }

    const out: UploadRunResult = {
      label,
      ok: Boolean(success),
      error: failed?.error ?? (success ? undefined : "Upload did not complete"),
      key,
      cdnUrl: (success?.uploadURL as string | undefined) ?? null,
      bytes: uploaded?.size ?? file.size,
      startT: startT ?? endT,
      endT,
      partEvents,
      lifecycle,
      stalls,
      resumes,
      chaosLog,
      processed,
      posterUrl,
      posterKey: posterUrl && key ? `${key}.poster.jpg` : null,
    };
    dbg.info(`uploadOnce done [${label}]`, {
      ok: out.ok,
      error: out.error,
      key: out.key,
      cdnUrl: out.cdnUrl,
      bytes: out.bytes,
      stalls,
      resumes,
      parts: partEvents.filter((e) => e.phase === "put_end").length,
      verifyHint: out.cdnUrl
        ? `Open ${out.cdnUrl} or check Spaces key ${out.key}`
        : out.key
          ? `No uploadURL; key was ${out.key} — object may be incomplete multipart`
          : "No key — createMultipartUpload likely never succeeded",
    });
    return out;
  } catch (err) {
    dbg.error(`uploadOnce threw [${label}]`, err);
    dbg.setLastError(err);
    throw err;
  } finally {
    timers.forEach(clearTimeout);
    opts.signal?.removeEventListener("abort", onAbort);
    opts.onSkipAvailable?.(null);
    uploader.destroy();
    dbg.debug(`uploader destroyed [${label}]`);
  }
}

export type TestOutcome = {
  runId: string;
  createdAt: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  config: UploadConfig;
  chaos: ChaosSettings;
  compress: CompressResult | null;
  memory: MemorySample | null;
  uploads: Partial<Record<UploadLabel, UploadRunResult>>;
  downloads: Partial<Record<UploadLabel, DownloadSuite>>;
  localUrls: { original: string; compressed: string | null; poster: string | null };
};

export type FullTestOptions = RunCallbacks & {
  file: File;
  config: UploadConfig;
  chaos: ChaosSettings;
  uploadOriginal: boolean;
  runDownloads: boolean;
  signal?: AbortSignal;
  /** Called whenever the outcome has new preview/result data (compress done, upload done, downloads done). */
  onSnapshot?: (outcome: TestOutcome) => void;
};

export function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${rand}`;
}

function applyProcessed(outcome: TestOutcome, processed: ProcessedFile) {
  outcome.compress = processed.compress;
  if (outcome.localUrls.compressed?.startsWith("blob:")) {
    URL.revokeObjectURL(outcome.localUrls.compressed);
  }
  if (outcome.localUrls.poster?.startsWith("blob:")) {
    URL.revokeObjectURL(outcome.localUrls.poster);
  }
  outcome.localUrls.compressed = URL.createObjectURL(processed.compress.file);
  outcome.localUrls.poster = processed.poster
    ? URL.createObjectURL(processed.poster.blob)
    : null;
  dbg.info("applyProcessed → preview URLs", {
    compressedBlob: outcome.localUrls.compressed,
    posterBlob: outcome.localUrls.poster,
    compressedFlag: processed.compress.compressed,
    outSize: processed.compress.file.size,
  });
}

export async function runFullTest(opts: FullTestOptions): Promise<TestOutcome> {
  const runId = newRunId();
  const isVideo = opts.file.type.startsWith("video/");
  dbg.info("=== runFullTest start ===", {
    runId,
    file: dbg.describeBlob(opts.file),
    uploadOriginal: opts.uploadOriginal,
    runDownloads: opts.runDownloads,
    preset: {
      multipart: opts.config.transport.multipartThresholdMB,
      partSizeMB: opts.config.transport.partSizeMB,
      concurrency: opts.config.transport.concurrency,
      videoEnabled: opts.config.video.enabled,
      maxLongEdge: opts.config.video.maxLongEdge,
      bitrate: opts.config.video.bitrate,
    },
  });
  const outcome: TestOutcome = {
    runId,
    createdAt: new Date().toISOString(),
    fileName: opts.file.name,
    fileSize: opts.file.size,
    fileType: opts.file.type,
    config: opts.config,
    chaos: opts.chaos,
    compress: null,
    memory: null,
    uploads: {},
    downloads: {},
    localUrls: { original: URL.createObjectURL(opts.file), compressed: null, poster: null },
  };
  const snap = () => {
    dbg.debug("snapshot", {
      compress: outcome.compress
        ? {
            compressed: outcome.compress.compressed,
            skipped: outcome.compress.skippedReason,
            in: outcome.compress.input.sizeBytes,
            out: outcome.compress.output.sizeBytes,
          }
        : null,
      media: {
        original: Boolean(outcome.localUrls.original),
        compressed: Boolean(outcome.localUrls.compressed),
        poster: Boolean(outcome.localUrls.poster),
      },
      uploads: Object.fromEntries(
        Object.entries(outcome.uploads).map(([k, u]) => [
          k,
          u ? { ok: u.ok, key: u.key, cdnUrl: u.cdnUrl, error: u.error } : null,
        ]),
      ),
      downloads: Object.keys(outcome.downloads),
    });
    dbg.setLastOutcome(outcome);
    opts.onSnapshot?.(outcome);
  };

  // Show the original in Preview A immediately.
  snap();

  const [compressed, memory] = await withPeakMemory(() =>
    uploadOnce({
      ...opts,
      runId,
      label: "compressed",
      onCompressed: (processed) => {
        applyProcessed(outcome, processed);
        // Surface compressed preview + Compression results as soon as preprocess
        // finishes — do not wait for the network upload or download benches.
        snap();
      },
    }),
  );
  outcome.uploads.compressed = compressed;
  outcome.memory = memory;
  if (!outcome.compress && compressed.processed) {
    applyProcessed(outcome, compressed.processed);
  } else if (!outcome.localUrls.compressed && compressed.ok && compressed.cdnUrl) {
    outcome.localUrls.compressed = compressed.cdnUrl;
  }
  snap();

  if (opts.uploadOriginal && !opts.signal?.aborted) {
    outcome.uploads.original = await uploadOnce({ ...opts, runId, label: "original" });
    snap();
  }

  if (opts.runDownloads && !opts.signal?.aborted) {
    for (const label of ["compressed", "original"] as const) {
      const up = outcome.uploads[label];
      if (!up?.ok || !up.cdnUrl) {
        dbg.warn(`skip download bench [${label}]`, { ok: up?.ok, cdnUrl: up?.cdnUrl, error: up?.error });
        continue;
      }
      opts.onPhase?.(`Benchmarking ${label} downloads`);
      dbg.info(`download bench start [${label}]`, { cdnUrl: up.cdnUrl });
      outcome.downloads[label] = await runDownloadSuite(up.cdnUrl, { video: isVideo, signal: opts.signal });
      dbg.info(`download bench done [${label}]`, outcome.downloads[label]);
      snap();
    }
  }
  opts.onPhase?.("Done");
  dbg.info("=== runFullTest done ===", {
    runId,
    compressOk: outcome.compress?.compressed,
    uploadOk: outcome.uploads.compressed?.ok,
    key: outcome.uploads.compressed?.key,
    cdnUrl: outcome.uploads.compressed?.cdnUrl,
  });
  snap();
  return outcome;
}

export function revokeOutcomeUrls(o: TestOutcome) {
  for (const url of Object.values(o.localUrls)) if (url) URL.revokeObjectURL(url);
}

