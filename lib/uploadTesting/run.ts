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
        opts.onPartEvent?.(label, e);
      },
      onLifecycle: (e) => {
        if (startT == null && e.step !== "poster_put") startT = performance.now() - e.ms;
        lifecycle.push({ ...e, t: performance.now() });
      },
      onProcessed: (_id, p) => {
        processed = p;
        startT = performance.now();
        opts.onSkipAvailable?.(null);
        opts.onPhase?.(`Uploading ${label}`);
      },
    },
  });
  const { uppy } = uploader;

  const onAbort = () => uppy.cancelAll();
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const meta: Meta = label === "original" ? { skipCompression: true, skipPoster: true } : {};
    const fileId = uppy.addFile({ name: file.name, type: file.type, data: file, source: "sandbox", meta });

    let paused = false;
    let offlined = false;
    uppy.on("preprocess-progress", (f, progress) => {
      if (f?.id === fileId && progress.mode === "determinate") {
        opts.onCompressProgress?.(progress.value);
      }
    });
    uppy.on("upload-stalled", () => {
      stalls++;
    });
    uppy.on("upload-progress", (f, progress) => {
      if (!f || f.id !== fileId || !progress.bytesTotal) return;
      const pct = (progress.bytesUploaded / progress.bytesTotal) * 100;
      opts.onUploadProgress?.(label, pct / 100);
      const at = () => (startT != null ? `${((performance.now() - startT) / 1000).toFixed(1)}s` : "");
      if (chaos.pauseEnabled && !paused && pct >= chaos.pauseAtPct) {
        paused = true;
        chaosLog.push(`${at()} pauseAll at ${pct.toFixed(0)}%`);
        uppy.pauseAll();
        timers.push(
          setTimeout(() => {
            chaosLog.push(`${at()} resumeAll after ${chaos.pauseSec}s`);
            resumes++;
            uppy.resumeAll();
          }, chaos.pauseSec * 1000),
        );
      }
      if (chaos.offlineEnabled && !offlined && pct >= chaos.offlineAtPct) {
        offlined = true;
        chaosLog.push(`${at()} simulated offline at ${pct.toFixed(0)}%`);
        uppy.pauseAll();
        window.dispatchEvent(new Event("offline"));
        timers.push(
          setTimeout(() => {
            chaosLog.push(`${at()} online event after ${chaos.offlineSec}s`);
            window.dispatchEvent(new Event("online"));
            resumes++;
            uppy.resumeAll();
            if (chaos.retryAllAfterOffline) {
              chaosLog.push(`${at()} retryAll`);
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

    const result = await uppy.upload();
    const endT = performance.now();
    const success = result?.successful?.find((f) => f.id === fileId);
    const failed = result?.failed?.find((f) => f.id === fileId);
    const uploaded = uppy.getFile(fileId);

    let posterUrl: string | null = null;
    const key = uploader.getUploadedKey(fileId) ?? null;
    if (success && label === "compressed" && config.poster.enabled) {
      opts.onPhase?.("Uploading poster");
      posterUrl = await uploader.uploadPoster(fileId);
    }

    return {
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
  } finally {
    timers.forEach(clearTimeout);
    opts.signal?.removeEventListener("abort", onAbort);
    opts.onSkipAvailable?.(null);
    uploader.destroy();
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
};

export function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${rand}`;
}

export async function runFullTest(opts: FullTestOptions): Promise<TestOutcome> {
  const runId = newRunId();
  const isVideo = opts.file.type.startsWith("video/");
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

  const [compressed, memory] = await withPeakMemory(() =>
    uploadOnce({ ...opts, runId, label: "compressed" }),
  );
  outcome.uploads.compressed = compressed;
  outcome.memory = memory;
  const processed = compressed.processed;
  if (processed) {
    outcome.compress = processed.compress;
    if (processed.compress.compressed) {
      outcome.localUrls.compressed = URL.createObjectURL(processed.compress.file);
    }
    if (processed.poster) outcome.localUrls.poster = URL.createObjectURL(processed.poster.blob);
  }

  if (opts.uploadOriginal && !opts.signal?.aborted) {
    outcome.uploads.original = await uploadOnce({ ...opts, runId, label: "original" });
  }

  if (opts.runDownloads && !opts.signal?.aborted) {
    for (const label of ["compressed", "original"] as const) {
      const up = outcome.uploads[label];
      if (!up?.ok || !up.cdnUrl) continue;
      opts.onPhase?.(`Benchmarking ${label} downloads`);
      outcome.downloads[label] = await runDownloadSuite(up.cdnUrl, { video: isVideo, signal: opts.signal });
    }
  }
  opts.onPhase?.("Done");
  return outcome;
}

export function revokeOutcomeUrls(o: TestOutcome) {
  for (const url of Object.values(o.localUrls)) if (url) URL.revokeObjectURL(url);
}

