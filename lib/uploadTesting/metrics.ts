import type { LifecycleEvent, PartEvent } from "../upload/uppyConfig";

export type TimedLifecycleEvent = LifecycleEvent & { t: number };

export type AttemptStatus = "ok" | "sign_error" | "put_error" | "pending";

/** One sign+PUT try of a part. Times are ms relative to the waterfall origin. */
export type PartAttempt = {
  signStart: number | null;
  signEnd: number | null;
  putStart: number | null;
  putEnd: number | null;
  status: AttemptStatus;
  injected: boolean;
  error?: string;
  bytes: number | null;
};

export type PartRow = {
  partNumber: number;
  multipart: boolean;
  attempts: PartAttempt[];
  bytes: number | null;
  status: AttemptStatus;
};

export type Waterfall = {
  /** Absolute performance.now() of the first event. */
  origin: number;
  durationMs: number;
  rows: PartRow[];
};

function sorted(events: PartEvent[]): PartEvent[] {
  return [...events].sort((a, b) => a.t - b.t);
}

export function buildWaterfall(events: PartEvent[]): Waterfall {
  const evs = sorted(events);
  if (evs.length === 0) return { origin: 0, durationMs: 0, rows: [] };
  const origin = evs[0].t;
  const rows = new Map<number, PartRow>();
  let last = origin;

  const newAttempt = (): PartAttempt => ({
    signStart: null,
    signEnd: null,
    putStart: null,
    putEnd: null,
    status: "pending",
    injected: false,
    bytes: null,
  });

  for (const e of evs) {
    const rel = e.t - origin;
    last = Math.max(last, e.t);
    let row = rows.get(e.partNumber);
    if (!row) {
      row = { partNumber: e.partNumber, multipart: e.multipart, attempts: [], bytes: null, status: "pending" };
      rows.set(e.partNumber, row);
    }
    const current = row.attempts[row.attempts.length - 1];
    const open = current && current.status === "pending" ? current : null;
    if (e.bytes != null) row.bytes = e.bytes;

    switch (e.phase) {
      case "sign_start": {
        const a = newAttempt();
        a.signStart = rel;
        row.attempts.push(a);
        break;
      }
      case "sign_end":
        if (open) open.signEnd = rel;
        break;
      case "sign_error":
        if (open) {
          open.signEnd = rel;
          open.status = "sign_error";
          open.injected = Boolean(e.injected);
          open.error = e.error;
        }
        break;
      case "put_start": {
        const a = open && open.putStart == null ? open : newAttempt();
        if (a !== open) row.attempts.push(a);
        a.putStart = rel;
        a.bytes = e.bytes ?? null;
        break;
      }
      case "put_progress":
        break;
      case "put_end":
        if (open) {
          open.putEnd = rel;
          open.status = "ok";
        }
        break;
      case "put_error":
        if (open) {
          open.putEnd = rel;
          open.status = "put_error";
          open.injected = Boolean(e.injected);
          open.error = e.error;
        }
        break;
    }
  }

  const list = [...rows.values()].sort((a, b) => a.partNumber - b.partNumber);
  for (const row of list) {
    row.status = row.attempts.some((a) => a.status === "ok")
      ? "ok"
      : (row.attempts[row.attempts.length - 1]?.status ?? "pending");
  }
  return { origin, durationMs: last - origin, rows: list };
}

export type ConcurrencyPoint = { t: number; inFlight: number };
export type LaneSegment = { slot: number; start: number; end: number; ok: boolean; partNumber: number };

/** Step series of in-flight PUTs, plus PUT intervals packed into the fewest lanes. */
export function buildConcurrency(events: PartEvent[], origin?: number): {
  points: ConcurrencyPoint[];
  lanes: LaneSegment[];
  maxInFlight: number;
  laneCount: number;
} {
  const evs = sorted(events).filter((e) =>
    e.phase === "put_start" || e.phase === "put_end" || e.phase === "put_error",
  );
  if (evs.length === 0) return { points: [], lanes: [], maxInFlight: 0, laneCount: 0 };
  const t0 = origin ?? evs[0].t;
  const points: ConcurrencyPoint[] = [{ t: 0, inFlight: 0 }];
  let inFlight = 0;
  let maxInFlight = 0;
  const open = new Map<string, { start: number; slot: number }>();
  const busy: boolean[] = [];
  const lanes: LaneSegment[] = [];

  for (const e of evs) {
    const rel = e.t - t0;
    const k = `${e.fileId}:${e.partNumber}:${e.attempt}`;
    if (e.phase === "put_start") {
      inFlight++;
      let slot = busy.indexOf(false);
      if (slot === -1) slot = busy.length;
      busy[slot] = true;
      open.set(k, { start: rel, slot });
    } else {
      const o = open.get(k);
      if (!o) continue;
      open.delete(k);
      inFlight--;
      busy[o.slot] = false;
      lanes.push({ slot: o.slot, start: o.start, end: rel, ok: e.phase === "put_end", partNumber: e.partNumber });
    }
    maxInFlight = Math.max(maxInFlight, inFlight);
    points.push({ t: rel, inFlight });
  }
  const lastT = points[points.length - 1].t;
  for (const o of open.values()) {
    lanes.push({ slot: o.slot, start: o.start, end: lastT, ok: false, partNumber: -1 });
  }
  return { points, lanes, maxInFlight, laneCount: busy.length };
}

export type ThroughputPoint = { tSec: number; mbps: number };

/**
 * Bytes-on-the-wire per time bucket, from PUT progress deltas (failed attempts'
 * bytes still count — they used the network). MB/s = 1e6 bytes/s.
 */
export function buildThroughput(events: PartEvent[], bucketMs = 500, origin?: number): ThroughputPoint[] {
  const evs = sorted(events);
  if (evs.length === 0) return [];
  const t0 = origin ?? evs[0].t;
  const loaded = new Map<string, number>();
  const buckets = new Map<number, number>();
  let maxBucket = 0;
  for (const e of evs) {
    const k = `${e.fileId}:${e.partNumber}:${e.attempt}`;
    let delta = 0;
    if (e.phase === "put_start") {
      loaded.set(k, 0);
    } else if ((e.phase === "put_progress" || e.phase === "put_end") && e.loaded != null) {
      const prev = loaded.get(k) ?? 0;
      delta = Math.max(0, e.loaded - prev);
      loaded.set(k, Math.max(prev, e.loaded));
    }
    const b = Math.floor((e.t - t0) / bucketMs);
    maxBucket = Math.max(maxBucket, b);
    if (delta > 0) buckets.set(b, (buckets.get(b) ?? 0) + delta);
  }
  const out: ThroughputPoint[] = [];
  for (let b = 0; b <= maxBucket; b++) {
    out.push({ tSec: ((b + 1) * bucketMs) / 1000, mbps: (buckets.get(b) ?? 0) / 1e6 / (bucketMs / 1000) });
  }
  return out;
}

export type UploadSummary = {
  totalMs: number;
  bytes: number;
  effectiveMBps: number | null;
  parts: number;
  multipart: boolean;
  signMs: number;
  putMs: number;
  /** Share of per-part time spent waiting on our sign API. */
  signOverheadPct: number | null;
  partRetries: number;
  signRetries: number;
  injectedFailures: number;
  stalls: number;
  resumes: number;
  maxInFlight: number;
  avgMBps: number | null;
  p10MBps: number | null;
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

export function summarizeUpload(
  events: PartEvent[],
  opts: { bytes: number; totalMs: number; stalls?: number; resumes?: number },
): UploadSummary {
  const wf = buildWaterfall(events);
  let signMs = 0;
  let putMs = 0;
  let partRetries = 0;
  let signRetries = 0;
  let injectedFailures = 0;
  for (const row of wf.rows) {
    let puts = 0;
    let signs = 0;
    for (const a of row.attempts) {
      if (a.signStart != null && a.signEnd != null) {
        signMs += a.signEnd - a.signStart;
        signs++;
      }
      if (a.putStart != null) {
        puts++;
        if (a.putEnd != null) putMs += a.putEnd - a.putStart;
      }
      if (a.injected) injectedFailures++;
    }
    partRetries += Math.max(0, puts - 1);
    signRetries += Math.max(0, signs - 1);
  }
  const conc = buildConcurrency(events);
  const tp = buildThroughput(events).map((p) => p.mbps).filter((v) => v > 0);
  const effective = opts.totalMs > 0 ? opts.bytes / 1e6 / (opts.totalMs / 1000) : null;
  return {
    totalMs: opts.totalMs,
    bytes: opts.bytes,
    effectiveMBps: effective,
    parts: wf.rows.length,
    multipart: wf.rows.some((r) => r.multipart),
    signMs,
    putMs,
    signOverheadPct: signMs + putMs > 0 ? (signMs / (signMs + putMs)) * 100 : null,
    partRetries,
    signRetries,
    injectedFailures,
    stalls: opts.stalls ?? 0,
    resumes: opts.resumes ?? 0,
    maxInFlight: conc.maxInFlight,
    avgMBps: tp.length ? tp.reduce((a, b) => a + b, 0) / tp.length : null,
    p10MBps: percentile(tp, 0.1),
  };
}

/** Compact per-part timeline for persisting (no progress events). */
export type CompactPart = {
  n: number;
  bytes: number | null;
  tries: number;
  status: AttemptStatus;
  attempts: Array<[signStart: number | null, signEnd: number | null, putStart: number | null, putEnd: number | null, status: AttemptStatus]>;
};

export function compactWaterfall(wf: Waterfall): CompactPart[] {
  const r = (v: number | null) => (v == null ? null : Math.round(v));
  return wf.rows.map((row) => ({
    n: row.partNumber,
    bytes: row.bytes,
    tries: row.attempts.length,
    status: row.status,
    attempts: row.attempts.map((a) => [r(a.signStart), r(a.signEnd), r(a.putStart), r(a.putEnd), a.status]),
  }));
}

/** Rebuilds a Waterfall from its persisted compact form (for history reloads). */
export function expandWaterfall(parts: CompactPart[]): Waterfall {
  let end = 0;
  const rows: PartRow[] = parts.map((p) => ({
    partNumber: p.n,
    multipart: true,
    bytes: p.bytes,
    status: p.status,
    attempts: p.attempts.map(([signStart, signEnd, putStart, putEnd, status]) => {
      end = Math.max(end, signEnd ?? 0, putEnd ?? 0);
      return { signStart, signEnd, putStart, putEnd, status, injected: false, bytes: p.bytes };
    }),
  }));
  return { origin: 0, durationMs: end, rows };
}
