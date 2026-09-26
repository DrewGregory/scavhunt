export type DownloadBench = {
  url: string;
  ok: boolean;
  status: number | null;
  /** fetch() resolved (response headers received). */
  headersMs: number | null;
  /** First body chunk read. */
  ttfbMs: number | null;
  totalMs: number | null;
  bytes: number;
  mbps: number | null;
  /** Response header hints about which cache served it. */
  cacheHint: string | null;
  error?: string;
};

export type FirstFrameBench = {
  url: string;
  loadedDataMs: number | null;
  playingMs: number | null;
  error?: string;
};

export type DownloadSuite = {
  origin: DownloadBench;
  cdnCold: DownloadBench;
  cdnWarm: DownloadBench;
  browserCache: DownloadBench;
  firstFrameOrigin: FirstFrameBench | null;
  firstFrameCdn: FirstFrameBench | null;
};

export const CORS_HINT =
  "Request failed — likely CORS. The Spaces bucket CORS policy must allow GET (and HEAD) from this origin.";

function withCacheBuster(url: string): string {
  const u = new URL(url);
  u.searchParams.set("cb", Math.random().toString(36).slice(2));
  return u.toString();
}

export function cdnToOrigin(cdnUrl: string): string {
  return cdnUrl.replace(".cdn.digitaloceanspaces.com", ".digitaloceanspaces.com");
}

export async function benchDownload(
  url: string,
  cache: RequestCache = "no-store",
  signal?: AbortSignal,
): Promise<DownloadBench> {
  const started = performance.now();
  const result: DownloadBench = {
    url,
    ok: false,
    status: null,
    headersMs: null,
    ttfbMs: null,
    totalMs: null,
    bytes: 0,
    mbps: null,
    cacheHint: null,
  };
  try {
    const res = await fetch(url, { cache, mode: "cors", signal });
    result.headersMs = performance.now() - started;
    result.status = res.status;
    const age = res.headers.get("age");
    result.cacheHint =
      res.headers.get("cf-cache-status") ??
      res.headers.get("x-cache") ??
      (age != null ? `age=${age}` : null);
    if (!res.ok || !res.body) {
      result.error = `HTTP ${res.status}`;
      return result;
    }
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (result.ttfbMs == null) result.ttfbMs = performance.now() - started;
      result.bytes += value.byteLength;
    }
    result.totalMs = performance.now() - started;
    result.ok = true;
    result.mbps = result.totalMs > 0 ? result.bytes / 1e6 / (result.totalMs / 1000) : null;
    return result;
  } catch (err) {
    result.error = err instanceof TypeError ? CORS_HINT : err instanceof Error ? err.message : String(err);
    return result;
  }
}

/** src set -> loadeddata and -> playing on a fresh muted <video>. */
export function benchFirstFrame(url: string, timeoutMs = 30_000): Promise<FirstFrameBench> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const out: FirstFrameBench = { url, loadedDataMs: null, playingMs: null };
    let started = 0;
    const done = (error?: string) => {
      clearTimeout(timer);
      if (error) out.error = error;
      video.pause();
      video.removeAttribute("src");
      video.load();
      resolve(out);
    };
    const timer = setTimeout(() => done("timeout"), timeoutMs);
    video.addEventListener("loadeddata", () => {
      out.loadedDataMs = performance.now() - started;
      video.play().catch((e: unknown) => done(e instanceof Error ? e.message : "play() rejected"));
    });
    video.addEventListener("playing", () => {
      out.playingMs = performance.now() - started;
      done();
    });
    video.addEventListener("error", () =>
      done(video.error?.message || `media error ${video.error?.code ?? ""}`.trim() + " (CORS or unsupported codec?)"),
    );
    started = performance.now();
    video.src = url;
  });
}

export async function runDownloadSuite(
  cdnUrl: string,
  opts: { video: boolean; signal?: AbortSignal },
): Promise<DownloadSuite> {
  const originUrl = withCacheBuster(cdnToOrigin(cdnUrl));
  const coldUrl = withCacheBuster(cdnUrl);
  const origin = await benchDownload(originUrl, "no-store", opts.signal);
  const cdnCold = await benchDownload(coldUrl, "no-store", opts.signal);
  // "reload" skips the browser cache but stores the response, so the next
  // force-cache fetch can be served locally.
  const cdnWarm = await benchDownload(coldUrl, "reload", opts.signal);
  const browserCache = await benchDownload(coldUrl, "force-cache", opts.signal);
  let firstFrameOrigin: FirstFrameBench | null = null;
  let firstFrameCdn: FirstFrameBench | null = null;
  if (opts.video) {
    firstFrameOrigin = await benchFirstFrame(withCacheBuster(cdnToOrigin(cdnUrl)));
    firstFrameCdn = await benchFirstFrame(coldUrl);
  }
  return { origin, cdnCold, cdnWarm, browserCache, firstFrameOrigin, firstFrameCdn };
}

export type MemorySample = { bytes: number | null; note: string };

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  memory?: { usedJSHeapSize: number };
};

export async function sampleMemory(): Promise<MemorySample> {
  if (typeof performance === "undefined") return { bytes: null, note: "n/a" };
  const perf = performance as MemoryPerformance;
  if (typeof perf.measureUserAgentSpecificMemory === "function" && globalThis.crossOriginIsolated) {
    try {
      const m = await perf.measureUserAgentSpecificMemory();
      return { bytes: m.bytes, note: "measureUserAgentSpecificMemory" };
    } catch {
      // fall through
    }
  }
  if (perf.memory?.usedJSHeapSize) {
    return { bytes: perf.memory.usedJSHeapSize, note: "JS heap only (performance.memory)" };
  }
  return { bytes: null, note: "n/a (needs cross-origin isolation)" };
}

/** Polls memory while `work` runs and returns the peak observed. */
export async function withPeakMemory<T>(work: () => Promise<T>, everyMs = 1000): Promise<[T, MemorySample]> {
  let peak: MemorySample = await sampleMemory();
  let stopped = false;
  const poll = (async () => {
    while (!stopped) {
      await new Promise((r) => setTimeout(r, everyMs));
      const s = await sampleMemory();
      if (s.bytes != null && (peak.bytes == null || s.bytes > peak.bytes)) peak = s;
    }
  })();
  try {
    return [await work(), peak];
  } finally {
    stopped = true;
    void poll;
  }
}
