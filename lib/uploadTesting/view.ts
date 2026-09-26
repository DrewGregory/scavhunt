import type { PartEvent } from "../upload/uppyConfig";
import type { UploadConfig } from "../upload/config";
import type { MediaInfo, SkipReason } from "../upload/compress";
import type { DownloadSuite, MemorySample } from "./benchmarks";
import {
  buildConcurrency,
  buildThroughput,
  buildWaterfall,
  compactWaterfall,
  expandWaterfall,
  summarizeUpload,
  type CompactPart,
  type ThroughputPoint,
  type UploadSummary,
  type Waterfall,
} from "./metrics";
import type { ChaosSettings, TestOutcome, UploadLabel, UploadRunResult } from "./run";
import type { SerializedUploadTestRun } from "./storage";

export type LifecycleRow = { step: string; ok: boolean; status: number; ms: number; atMs: number; error?: string };

export type UploadView = {
  ok: boolean;
  error?: string;
  key: string | null;
  cdnUrl: string | null;
  summary: UploadSummary;
  waterfall: Waterfall;
  concurrency: ReturnType<typeof buildConcurrency>;
  throughput: ThroughputPoint[];
  lifecycle: LifecycleRow[];
  chaosLog: string[];
};

export type CompressView = {
  compressed: boolean;
  skippedReason?: SkipReason;
  errorMessage?: string;
  input: MediaInfo;
  output: MediaInfo;
  compressMs: number;
  realtimeFactor: number | null;
  usedWorker: boolean;
};

export type TestView = {
  runId: string;
  source: "live" | "history";
  createdAt: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  config: UploadConfig;
  chaos: ChaosSettings | null;
  compress: CompressView | null;
  memory: MemorySample | null;
  uploads: Partial<Record<UploadLabel, UploadView>>;
  downloads: Partial<Record<UploadLabel, DownloadSuite>>;
  media: { original: string | null; compressed: string | null; poster: string | null };
  deviceLabel?: string | null;
  connection?: string | null;
};

function downsample<T>(points: T[], max = 200): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]);
}

function uploadView(r: UploadRunResult): UploadView {
  const waterfall = buildWaterfall(r.partEvents);
  const origin = waterfall.rows.length ? waterfall.origin : r.startT;
  return {
    ok: r.ok,
    error: r.error,
    key: r.key,
    cdnUrl: r.cdnUrl,
    summary: summarizeUpload(r.partEvents, {
      bytes: r.bytes,
      totalMs: r.endT - r.startT,
      stalls: r.stalls,
      resumes: r.resumes,
    }),
    waterfall,
    concurrency: buildConcurrency(r.partEvents, origin),
    throughput: buildThroughput(r.partEvents, 500, origin),
    lifecycle: r.lifecycle.map((l) => ({
      step: l.step,
      ok: l.ok,
      status: l.status,
      ms: l.ms,
      atMs: l.t - l.ms - r.startT,
      error: l.error,
    })),
    chaosLog: r.chaosLog,
  };
}

function compressView(o: TestOutcome): CompressView | null {
  const c = o.compress;
  if (!c) return null;
  return {
    compressed: c.compressed,
    skippedReason: c.skippedReason,
    errorMessage: c.errorMessage,
    input: c.input,
    output: c.compressed ? c.output : { ...c.input },
    compressMs: c.compressMs,
    realtimeFactor: c.realtimeFactor,
    usedWorker: c.usedWorker,
  };
}

export function viewFromOutcome(o: TestOutcome): TestView {
  const uploads: TestView["uploads"] = {};
  for (const label of ["compressed", "original"] as const) {
    const r = o.uploads[label];
    if (r) uploads[label] = uploadView(r);
  }
  return {
    runId: o.runId,
    source: "live",
    createdAt: o.createdAt,
    fileName: o.fileName,
    fileSize: o.fileSize,
    fileType: o.fileType,
    config: o.config,
    chaos: o.chaos,
    compress: compressView(o),
    memory: o.memory,
    uploads,
    downloads: o.downloads,
    media: {
      // Prefer the local compressed blob for instant side-by-side; fall back to
      // the CDN object once uploaded (and for history reloads).
      original: o.localUrls.original,
      compressed:
        o.localUrls.compressed ??
        o.uploads.compressed?.cdnUrl ??
        o.localUrls.original,
      poster: o.localUrls.poster ?? null,
    },
  };
}

type SavedUpload = Omit<UploadView, "waterfall" | "concurrency"> & { parts: CompactPart[] };

export type SavedMetrics = {
  version: 1;
  fileSize: number;
  fileType: string;
  compress: CompressView | null;
  memory: MemorySample | null;
  uploads: Partial<Record<UploadLabel, SavedUpload>>;
  downloads: Partial<Record<UploadLabel, DownloadSuite>>;
};

export type SavedSettings = { config: UploadConfig; chaos: ChaosSettings | null; label: string };

export function savedPayload(view: TestView, label: string) {
  const uploads: SavedMetrics["uploads"] = {};
  for (const [k, u] of Object.entries(view.uploads) as Array<[UploadLabel, UploadView]>) {
    const { waterfall, concurrency: _c, ...rest } = u;
    uploads[k] = { ...rest, throughput: downsample(rest.throughput), parts: compactWaterfall(waterfall) };
  }
  const metrics: SavedMetrics = {
    version: 1,
    fileSize: view.fileSize,
    fileType: view.fileType,
    compress: view.compress,
    memory: view.memory,
    uploads,
    downloads: view.downloads,
  };
  const settings: SavedSettings = { config: view.config, chaos: view.chaos, label };
  return {
    fileName: view.fileName,
    connection: connectionLabel(),
    settings,
    metrics,
    originalKey: view.uploads.original?.key ?? null,
    compressedKey: view.uploads.compressed?.key ?? null,
    posterKey: view.uploads.compressed?.key && view.media.poster ? `${view.uploads.compressed.key}.poster.jpg` : null,
  };
}

function partsToEvents(wf: Waterfall): PartEvent[] {
  const events: PartEvent[] = [];
  for (const row of wf.rows) {
    row.attempts.forEach((a, i) => {
      if (a.putStart == null) return;
      const base = { fileId: "saved", partNumber: row.partNumber, multipart: row.multipart, attempt: i + 1 };
      events.push({ ...base, phase: "put_start", t: a.putStart });
      if (a.putEnd != null) {
        events.push({ ...base, phase: a.status === "ok" ? "put_end" : "put_error", t: a.putEnd });
      }
    });
  }
  return events;
}

export function viewFromSaved(run: SerializedUploadTestRun): TestView | null {
  const m = run.metrics as SavedMetrics | null;
  const s = run.settings as SavedSettings | null;
  if (!m || m.version !== 1 || !s?.config) return null;
  const uploads: TestView["uploads"] = {};
  for (const [k, u] of Object.entries(m.uploads ?? {}) as Array<[UploadLabel, SavedUpload]>) {
    const { parts, ...rest } = u;
    const waterfall = expandWaterfall(parts ?? []);
    const cdnUrl = (k === "original" ? run.original?.cdnUrl : run.compressed?.cdnUrl) ?? rest.cdnUrl;
    uploads[k] = { ...rest, cdnUrl, waterfall, concurrency: buildConcurrency(partsToEvents(waterfall), 0) };
  }
  return {
    runId: run.id,
    source: "history",
    createdAt: run.createdAt,
    fileName: run.fileName ?? "(unknown)",
    fileSize: m.fileSize,
    fileType: m.fileType,
    config: s.config,
    chaos: s.chaos,
    compress: m.compress,
    memory: m.memory,
    uploads,
    downloads: m.downloads ?? {},
    media: {
      original: run.original?.cdnUrl ?? null,
      compressed: run.compressed?.cdnUrl ?? null,
      poster: run.poster?.cdnUrl ?? null,
    },
    deviceLabel: run.deviceLabel,
    connection: run.connection,
  };
}

type NetworkInformationLike = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
};

export function networkInfo(): NetworkInformationLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null;
}

export function connectionLabel(): string | null {
  const c = networkInfo();
  if (!c) return null;
  return [c.type, c.effectiveType, c.downlink != null ? `${c.downlink}Mbps` : null].filter(Boolean).join(" ") || null;
}
