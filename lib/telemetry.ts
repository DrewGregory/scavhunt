export type TelemetryLevel = "info" | "warn" | "error";

export type TelemetryFields = {
  level?: TelemetryLevel;
  attemptId?: string;
  submissionId?: string;
  challengeId?: string;
  durationMs?: number;
  bytes?: number;
  originalBytes?: number;
  errorCode?: string;
  errorMessage?: string;
  sandbox?: boolean;
  meta?: Record<string, unknown>;
};

export type TelemetryEvent = TelemetryFields & {
  type: string;
  clientTs: number;
  sessionId: string;
  connection?: string;
};

const ENDPOINT = "/api/telemetry";
const STORAGE_KEY = "scavhunt.telemetry.pending";
const SESSION_KEY = "scavhunt.telemetry.session";
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT = 20;
const MAX_BATCH = 50;
const MAX_STORED = 500;

let queue: TelemetryEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let initialized = false;
let flushing = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function randomId() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newAttemptId(): string {
  return randomId();
}

export function getSessionId(): string {
  if (!isBrowser()) return "server";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function connectionType(): string | undefined {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const c = nav.connection;
  if (!c) return undefined;
  return `${c.effectiveType ?? "unknown"}${c.saveData ? "+saveData" : ""}`;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue.slice(-MAX_STORED)));
  } catch {
    // storage full or unavailable; events stay in memory
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) queue = parsed.concat(queue);
    }
  } catch {
    // ignore corrupt storage
  }
}

function init() {
  if (initialized || !isBrowser()) return;
  initialized = true;
  restore();
  timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  window.addEventListener("online", () => void flush());
  window.addEventListener("pagehide", () => flush({ beacon: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush({ beacon: true });
  });
}

export function track(type: string, fields: TelemetryFields = {}): void {
  if (!isBrowser()) return;
  init();
  queue.push({
    ...fields,
    type,
    clientTs: Date.now(),
    sessionId: getSessionId(),
    connection: connectionType(),
  });
  persist();
  if (queue.length >= FLUSH_AT) void flush();
}

export async function flush(opts: { beacon?: boolean } = {}): Promise<void> {
  if (!isBrowser() || queue.length === 0 || flushing) return;
  if (!navigator.onLine && !opts.beacon) return;
  const batch = queue.slice(0, MAX_BATCH);
  const body = JSON.stringify({ events: batch });

  if (opts.beacon && "sendBeacon" in navigator) {
    const ok = navigator.sendBeacon(
      ENDPOINT,
      new Blob([body], { type: "application/json" }),
    );
    if (ok) {
      queue = queue.slice(batch.length);
      persist();
    }
    return;
  }

  flushing = true;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    // Drop on 4xx too: a malformed batch would otherwise retry forever.
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      queue = queue.slice(batch.length);
      persist();
    }
  } catch {
    // offline or server error; retry on next tick
  } finally {
    flushing = false;
  }
  if (queue.length >= FLUSH_AT) void flush();
}

export function stopTelemetryForTests() {
  if (timer) clearInterval(timer);
  timer = null;
  initialized = false;
}
