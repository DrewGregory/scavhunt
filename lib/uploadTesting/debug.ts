/**
 * Verbose logging for /admin/upload-testing so prod debugging is possible
 * from DevTools without a rebuild. Always on for this page (admin-only).
 *
 * In the console filter by: upload-testing
 * Inspect last run: window.__uploadTesting
 */

export type UploadTestingDebugApi = {
  lastOutcome: unknown;
  lastView: unknown;
  lastError: unknown;
  events: Array<{ t: number; level: string; msg: string; data?: unknown }>;
  log: typeof log;
};

const MAX_EVENTS = 500;
const events: UploadTestingDebugApi["events"] = [];

function ensureApi(): UploadTestingDebugApi {
  if (typeof window === "undefined") {
    return { lastOutcome: null, lastView: null, lastError: null, events, log };
  }
  const w = window as Window & { __uploadTesting?: UploadTestingDebugApi };
  if (!w.__uploadTesting) {
    w.__uploadTesting = { lastOutcome: null, lastView: null, lastError: null, events, log };
  }
  return w.__uploadTesting;
}

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

export function log(level: "debug" | "info" | "warn" | "error", msg: string, data?: unknown) {
  const api = ensureApi();
  const entry = { t: Date.now(), level, msg, data };
  api.events.push(entry);
  if (api.events.length > MAX_EVENTS) api.events.splice(0, api.events.length - MAX_EVENTS);

  const prefix = `[upload-testing ${stamp()}]`;
  const args = data === undefined ? [prefix, msg] : [prefix, msg, data];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else if (level === "info") console.info(...args);
  else console.debug(...args);
}

export function debug(msg: string, data?: unknown) {
  log("debug", msg, data);
}
export function info(msg: string, data?: unknown) {
  log("info", msg, data);
}
export function warn(msg: string, data?: unknown) {
  log("warn", msg, data);
}
export function error(msg: string, data?: unknown) {
  log("error", msg, data);
}

export function setLastOutcome(outcome: unknown) {
  ensureApi().lastOutcome = outcome;
}
export function setLastView(view: unknown) {
  ensureApi().lastView = view;
}
export function setLastError(err: unknown) {
  ensureApi().lastError = err;
}

/** Summarize a File/Blob for logs without dumping bytes. */
export function describeBlob(b: Blob | File | null | undefined) {
  if (!b) return null;
  return {
    size: b.size,
    type: b.type || "(empty type)",
    name: b instanceof File ? b.name : undefined,
  };
}
