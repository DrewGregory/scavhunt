import Uppy, { type Body, type Meta, type UppyFile } from "@uppy/core";
import AwsS3, { type AwsS3UploadParameters } from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import type { Restrictions } from "@uppy/core";
import axios from "axios";
import {
  partSizeBytes,
  shouldUseMultipartFor,
  type UploadConfig,
} from "./config";
import CompressPlugin, { type ProcessedFile } from "./compressPlugin";
import { mediaKind } from "./compress";
import { newAttemptId, track, type TelemetryFields } from "../telemetry";

export type PartPhase =
  | "sign_start"
  | "sign_end"
  | "sign_error"
  | "put_start"
  | "put_progress"
  | "put_end"
  | "put_error";

export type PartEvent = {
  fileId: string;
  /** 1-based; single-PUT uploads report part 1 with `multipart: false`. */
  partNumber: number;
  multipart: boolean;
  phase: PartPhase;
  /** performance.now() */
  t: number;
  /** 1-based attempt counter for this phase (sign and put are counted separately). */
  attempt: number;
  bytes?: number;
  loaded?: number;
  error?: string;
  /** True when the failure was injected via `faults`. */
  injected?: boolean;
};

export type LifecycleStep =
  | "create"
  | "list"
  | "complete"
  | "abort"
  | "put_url"
  | "poster_put";

export type LifecycleEvent = {
  fileId: string;
  step: LifecycleStep;
  ok: boolean;
  /** HTTP status; 0 for network errors. */
  status: number;
  ms: number;
  error?: string;
};

export type UploaderHooks = {
  onPartEvent?: (event: PartEvent) => void;
  onLifecycle?: (event: LifecycleEvent) => void;
  /** Compression + poster finished for a file (before its upload starts). */
  onProcessed?: (fileId: string, processed: ProcessedFile) => void;
};

/** Sandbox-only chaos knobs, as probabilities in [0, 1]. */
export type UploaderFaults = {
  signFailRate: number;
  putFailRate: number;
};

export type SandboxTarget = { runId: string; label: string };

export type CreateUploaderOptions = {
  config: UploadConfig;
  challengeId?: string;
  sandbox?: SandboxTarget;
  /** Fixed attempt id for every file; otherwise a new one is minted per added file. */
  attemptId?: string;
  hooks?: UploaderHooks;
  faults?: UploaderFaults;
  restrictions?: Partial<Restrictions>;
  autoProceed?: boolean;
  webcam?: boolean;
  /** Pause on a compression timeout until `compressor.resolveTimeout` is called. */
  promptOnCompressTimeout?: boolean;
};

export type Uploader = {
  uppy: Uppy<Meta, Body>;
  compressor: CompressPlugin<Meta, Body>;
  config: UploadConfig;
  attemptIdFor: (fileId: string) => string;
  /** Object key of a file's upload, once created. */
  getUploadedKey: (fileId: string) => string | undefined;
  /** Uploads the extracted poster next to the video; resolves its public URL or null. */
  uploadPoster: (fileId: string) => Promise<string | null>;
  setFaults: (faults: UploaderFaults | null) => void;
  destroy: () => void;
};

type UrlInfo = {
  fileId: string;
  partNumber: number;
  multipart: boolean;
  key: string;
  uploadId?: string;
  publicUrl?: string;
  expiresSec?: number;
};

type FileStats = {
  startedAt: number | null;
  finished: boolean;
  multipart: boolean;
  parts: Set<number>;
  partRetries: number;
  signRetries: number;
};

type ErrorWithSource = Error & { source?: { status?: number } };

function httpStatus(err: unknown): number {
  if (axios.isAxiosError(err)) return err.response?.status ?? 0;
  const status = (err as ErrorWithSource | null)?.source?.status;
  return typeof status === "number" ? status : 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createUploader(opts: CreateUploaderOptions): Uploader {
  const { config, challengeId, sandbox, hooks = {} } = opts;
  let faults = opts.faults ?? null;
  const t = config.transport;

  const attempts = new Map<string, string>();
  const keys = new Map<string, string>();
  const urlInfo = new Map<string, UrlInfo>();
  const partAttempts = new Map<string, { sign: number; put: number }>();
  const stats = new Map<string, FileStats>();

  const attemptIdFor = (fileId: string) => {
    if (opts.attemptId) return opts.attemptId;
    let id = attempts.get(fileId);
    if (!id) {
      id = newAttemptId();
      attempts.set(fileId, id);
    }
    return id;
  };

  const telemetry = (fileId: string | undefined, extra: TelemetryFields = {}): TelemetryFields => ({
    attemptId: fileId ? attemptIdFor(fileId) : opts.attemptId,
    challengeId,
    sandbox: Boolean(sandbox),
    ...extra,
    meta: sandbox ? { runId: sandbox.runId, label: sandbox.label, ...extra.meta } : extra.meta,
  });

  const statsFor = (fileId: string): FileStats => {
    let s = stats.get(fileId);
    if (!s) {
      s = { startedAt: null, finished: false, multipart: true, parts: new Set(), partRetries: 0, signRetries: 0 };
      stats.set(fileId, s);
    }
    return s;
  };

  const counterFor = (fileId: string, partNumber: number) => {
    const k = `${fileId}:${partNumber}`;
    let c = partAttempts.get(k);
    if (!c) {
      c = { sign: 0, put: 0 };
      partAttempts.set(k, c);
    }
    return c;
  };

  const headersFor = (fileId: string) => ({ "x-attempt-id": attemptIdFor(fileId) });
  const sandboxBody = sandbox
    ? { sandbox: true, runId: sandbox.runId, label: sandbox.label }
    : {};

  async function lifecycle<T>(fileId: string, step: LifecycleStep, fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      const result = await fn();
      hooks.onLifecycle?.({ fileId, step, ok: true, status: 200, ms: performance.now() - started });
      return result;
    } catch (err) {
      hooks.onLifecycle?.({
        fileId,
        step,
        ok: false,
        status: httpStatus(err),
        ms: performance.now() - started,
        error: errorMessage(err),
      });
      throw err;
    }
  }

  const partEvent = (e: Omit<PartEvent, "t">) => hooks.onPartEvent?.({ ...e, t: performance.now() });

  /**
   * Fetch ETag from our API when the browser cannot read it from the PUT
   * response (missing Access-Control-Expose-Headers: ETag on the bucket).
   * Avoids requiring Spaces CORS changes.
   */
  async function fetchEtagFromServer(
    info: UrlInfo,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const delays = [0, 200, 500, 1000, 2000];
    let lastErr: unknown;
    for (const delay of delays) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const res = await axios.get("/api/s3/part-etag", {
          params: {
            key: info.key,
            ...(info.uploadId
              ? { uploadId: info.uploadId, partNumber: info.partNumber }
              : {}),
          },
          headers,
          signal,
        });
        const etag = res.data?.etag as string | undefined;
        if (etag) return etag;
        lastErr = new Error("empty etag");
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Could not resolve part ETag");
  }

  const uploadPartBytes: typeof AwsS3.uploadPartBytes = async (options) => {
    const { signature, body, size, onProgress, onComplete, signal } = options;
    const info = urlInfo.get(signature.url);
    if (!info) return AwsS3.uploadPartBytes(options);
    urlInfo.delete(signature.url);

    const bytes = size ?? (body instanceof Blob ? body.size : 0);
    const counter = counterFor(info.fileId, info.partNumber);
    const attempt = ++counter.put;
    const base = {
      fileId: info.fileId,
      partNumber: info.partNumber,
      multipart: info.multipart,
      attempt,
      bytes,
    };
    if (attempt > 1) {
      statsFor(info.fileId).partRetries++;
      track("upload_part_retry", telemetry(info.fileId, {
        level: "warn",
        bytes,
        meta: { partNumber: info.partNumber, attempt },
      }));
    }
    partEvent({ ...base, phase: "put_start" });

    const method = (signature.method ?? "PUT").toUpperCase();
    const expiresSec =
      info.expiresSec != null
        ? info.expiresSec
        : typeof signature.expires === "number"
          ? signature.expires
          : undefined;

    const inner = new AbortController();
    const onOuterAbort = () => inner.abort();
    if (signal?.aborted) inner.abort();
    signal?.addEventListener("abort", onOuterAbort);

    const inject = faults != null && Math.random() < faults.putFailRate;
    const cutAt = bytes * (0.2 + Math.random() * 0.6);
    let injected = false;

    try {
      const etag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, signature.url, true);
        if (signature.headers) {
          for (const [k, v] of Object.entries(signature.headers)) {
            xhr.setRequestHeader(k, v);
          }
        }
        xhr.responseType = "text";
        if (expiresSec != null) xhr.timeout = expiresSec * 1000;

        const cleanup = () => {
          signal?.removeEventListener("abort", onOuterAbort);
        };
        const onabort = () => {
          xhr.abort();
        };
        inner.signal.addEventListener("abort", onabort);

        xhr.upload.addEventListener("progress", (ev) => {
          partEvent({ ...base, phase: "put_progress", loaded: ev.loaded });
          onProgress?.(ev);
          if (inject && !injected && ev.loaded >= cutAt) {
            injected = true;
            inner.abort();
          }
        });
        xhr.addEventListener("abort", () => {
          cleanup();
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
        xhr.addEventListener("timeout", () => {
          cleanup();
          const error: ErrorWithSource = Object.assign(new Error("Request has expired"), {
            source: { status: 403 },
          });
          reject(error);
        });
        xhr.addEventListener("error", () => {
          cleanup();
          reject(new Error("Network error during part upload"));
        });
        xhr.addEventListener("load", () => {
          cleanup();
          if (
            xhr.status === 403 &&
            typeof xhr.responseText === "string" &&
            xhr.responseText.includes("<Message>Request has expired</Message>")
          ) {
            const error: ErrorWithSource = Object.assign(new Error("Request has expired"), {
              source: { status: 403 },
            });
            reject(error);
            return;
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            const error: ErrorWithSource = Object.assign(new Error(`Non 2xx (${xhr.status})`), {
              source: { status: xhr.status },
            });
            reject(error);
            return;
          }
          onProgress?.({ loaded: bytes, lengthComputable: true } as ProgressEvent);

          // Header names from getAllResponseHeaders are lowercased.
          const raw = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
          const headersMap: Record<string, string> = {};
          for (const line of raw) {
            const i = line.indexOf(": ");
            if (i > 0) headersMap[line.slice(0, i).toLowerCase()] = line.slice(i + 2);
          }
          const fromCors = headersMap.etag;
          if (fromCors) {
            resolve(fromCors);
            return;
          }
          // CORS did not expose ETag — ask our server (ListParts / HeadObject).
          void fetchEtagFromServer(info, headersFor(info.fileId), signal)
            .then(resolve)
            .catch(reject);
        });
        xhr.send(body);
      });

      statsFor(info.fileId).parts.add(info.partNumber);
      partEvent({ ...base, phase: "put_end", loaded: bytes });
      onComplete?.(etag);
      return {
        etag,
        ETag: etag,
        ...(info.publicUrl ? { location: info.publicUrl } : {}),
      };
    } catch (err) {
      if (injected && !signal?.aborted) {
        const fault: ErrorWithSource = Object.assign(new Error("Injected upload failure"), {
          source: { status: 0 },
        });
        partEvent({ ...base, phase: "put_error", error: fault.message, injected: true });
        throw fault;
      }
      partEvent({ ...base, phase: "put_error", error: errorMessage(err) });
      throw err;
    } finally {
      signal?.removeEventListener("abort", onOuterAbort);
    }
  };

  const uppy = new Uppy<Meta, Body>({
    autoProceed: opts.autoProceed ?? true,
    restrictions: opts.restrictions ?? { maxNumberOfFiles: 1, minNumberOfFiles: 1 },
  });

  if (opts.webcam) {
    uppy.use(Webcam, {
      modes: ["video-audio"],
      mobileNativeCamera: true,
      showRecordingLength: true,
      showVideoSourceDropdown: true,
    });
  }

  uppy.use(CompressPlugin, {
    config,
    telemetryContext: (fileId) => telemetry(fileId),
    onProcessed: hooks.onProcessed,
    promptOnTimeout: opts.promptOnCompressTimeout,
  });

  uppy.use(AwsS3, {
    limit: t.concurrency,
    retryDelays: t.retryDelaysMs,
    shouldUseMultipart: (file: UppyFile<Meta, Body>) => {
      const multipart = shouldUseMultipartFor(config, file.size ?? 0);
      statsFor(file.id).multipart = multipart;
      return multipart;
    },
    getChunkSize: () => partSizeBytes(config),
    uploadPartBytes,
    getUploadParameters: async (file, { signal }): Promise<AwsS3UploadParameters> => {
      const res = await lifecycle(file.id, "put_url", () =>
        axios.post(
          "/api/s3/put-url",
          {
            challengeId,
            filename: file.name,
            contentType: file.type,
            purpose: "media",
            ...sandboxBody,
          },
          { headers: headersFor(file.id), signal },
        ),
      );
      const { url, key, publicUrl, headers } = res.data as {
        url: string;
        key: string;
        publicUrl: string;
        headers: Record<string, string>;
      };
      keys.set(file.id, key);
      const expiresSec = t.partTimeoutMs != null ? t.partTimeoutMs / 1000 : undefined;
      urlInfo.set(url, {
        fileId: file.id,
        partNumber: 1,
        multipart: false,
        key,
        publicUrl,
        expiresSec,
      });
      return { method: "PUT", url, headers, ...(expiresSec != null ? { expires: expiresSec } : {}) };
    },
    createMultipartUpload: async (file) => {
      const res = await lifecycle(file.id, "create", () =>
        axios.post(
          "/api/s3/multipart",
          {
            challengeId,
            filename: file.name,
            contentType: file.type,
            ...sandboxBody,
          },
          { headers: headersFor(file.id) },
        ),
      );
      keys.set(file.id, res.data.key);
      return { uploadId: res.data.uploadId, key: res.data.key };
    },
    listParts: async (file, { uploadId, key, signal }) => {
      const res = await lifecycle(file.id, "list", () =>
        axios.get("/api/s3/list-parts", {
          params: { uploadId, key },
          headers: headersFor(file.id),
          signal,
        }),
      );
      return res.data.parts;
    },
    signPart: async (file, { uploadId, key, partNumber, signal }) => {
      const counter = counterFor(file.id, partNumber);
      const attempt = ++counter.sign;
      const base = { fileId: file.id, partNumber, multipart: true, attempt };
      if (attempt > 1) statsFor(file.id).signRetries++;
      partEvent({ ...base, phase: "sign_start" });
      if (faults != null && Math.random() < faults.signFailRate) {
        partEvent({ ...base, phase: "sign_error", error: "Injected sign failure", injected: true });
        throw new Error("Injected sign failure");
      }
      try {
        const res = await axios.get("/api/s3/sign-part", {
          params: {
            uploadId,
            key,
            partNumber,
            ...(t.signExpiresSec != null ? { expiresIn: t.signExpiresSec } : {}),
          },
          headers: headersFor(file.id),
          signal,
        });
        const expiresSec = t.partTimeoutMs != null ? t.partTimeoutMs / 1000 : undefined;
        urlInfo.set(res.data.url, {
          fileId: file.id,
          partNumber,
          multipart: true,
          key,
          uploadId,
          expiresSec,
        });
        partEvent({ ...base, phase: "sign_end" });
        return {
          url: res.data.url,
          headers: res.data.headers,
          ...(expiresSec != null ? { expires: expiresSec } : {}),
        };
      } catch (err) {
        partEvent({ ...base, phase: "sign_error", error: errorMessage(err) });
        throw err;
      }
    },
    completeMultipartUpload: async (file, { uploadId, key, parts }) => {
      const res = await lifecycle(file.id, "complete", () =>
        axios.post("/api/s3/complete", { uploadId, key, parts }, { headers: headersFor(file.id) }),
      );
      return { location: res.data.location };
    },
    abortMultipartUpload: async (file, { uploadId, key }) => {
      await lifecycle(file.id, "abort", () =>
        axios.delete("/api/s3/abort", {
          params: { uploadId, key },
          headers: headersFor(file.id),
        }),
      );
    },
  });

  const onFileAdded = (file: UppyFile<Meta, Body>) => {
    track(
      "file_selected",
      telemetry(file.id, {
        bytes: file.size ?? undefined,
        meta: { type: file.type, kind: mediaKind(file), source: file.source },
      }),
    );
  };

  const onFileRemoved = (file: UppyFile<Meta, Body>) => {
    stats.delete(file.id);
    keys.delete(file.id);
    for (const k of partAttempts.keys()) {
      if (k.startsWith(`${file.id}:`)) partAttempts.delete(k);
    }
  };

  const onUploadStart = (files: UppyFile<Meta, Body>[]) => {
    for (const file of files) {
      const s = statsFor(file.id);
      s.startedAt = performance.now();
      s.finished = false;
      const processed = compressor.getResult(file.id);
      track(
        "upload_start",
        telemetry(file.id, {
          bytes: file.size ?? undefined,
          originalBytes: processed?.originalFile.size,
          meta: {
            multipart: shouldUseMultipartFor(config, file.size ?? 0),
            partSizeMB: t.partSizeMB,
            concurrency: t.concurrency,
            compressed: processed?.compress.compressed ?? false,
          },
        }),
      );
    }
  };

  const onUploadSuccess = (file: UppyFile<Meta, Body> | undefined) => {
    if (!file) return;
    const s = statsFor(file.id);
    s.finished = true;
    const durationMs = s.startedAt != null ? performance.now() - s.startedAt : undefined;
    const bytes = file.size ?? undefined;
    track(
      "upload_done",
      telemetry(file.id, {
        durationMs: durationMs != null ? Math.round(durationMs) : undefined,
        bytes,
        originalBytes: compressor.getResult(file.id)?.originalFile.size,
        meta: {
          throughputBps:
            durationMs && bytes ? Math.round((bytes * 8) / (durationMs / 1000)) : null,
          parts: s.parts.size,
          partRetries: s.partRetries,
          signRetries: s.signRetries,
          multipart: s.multipart,
        },
      }),
    );
  };

  const onUploadError = (
    file: UppyFile<Meta, Body> | undefined,
    error: { name: string; message: string; details?: string },
  ) => {
    if (!file) return;
    const s = statsFor(file.id);
    s.finished = true;
    track(
      "upload_failed",
      telemetry(file.id, {
        level: "error",
        durationMs: s.startedAt != null ? Math.round(performance.now() - s.startedAt) : undefined,
        bytes: file.size ?? undefined,
        errorCode: String(httpStatus(error)),
        errorMessage: error.message,
        meta: { parts: s.parts.size, partRetries: s.partRetries, details: error.details },
      }),
    );
  };

  const onStalled = (
    error: { message: string; details?: string },
    files: UppyFile<Meta, Body>[],
  ) => {
    for (const file of files) {
      track("upload_stalled", telemetry(file.id, { level: "warn", errorMessage: error.message }));
    }
  };

  const onNetworkChange = (type: "online" | "offline") => () => {
    for (const [fileId, s] of stats) {
      if (s.startedAt != null && !s.finished) {
        track(type, telemetry(fileId, { level: type === "offline" ? "warn" : "info" }));
      }
    }
  };
  const onOnline = onNetworkChange("online");
  const onOffline = onNetworkChange("offline");

  const compressor = uppy.getPlugin("ScavCompress") as unknown as CompressPlugin<Meta, Body>;

  uppy.on("file-added", onFileAdded);
  uppy.on("file-removed", onFileRemoved);
  uppy.on("upload-start", onUploadStart);
  uppy.on("upload-success", onUploadSuccess);
  uppy.on("upload-error", onUploadError);
  uppy.on("upload-stalled", onStalled);
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }

  async function putBlob(url: string, blob: Blob, headers: Record<string, string>) {
    try {
      return await fetch(url, { method: "PUT", body: blob, headers });
    } catch (err) {
      // A CORS preflight rejecting Content-Type/Cache-Control surfaces as a
      // TypeError; an untyped body with no headers needs no extra allowances.
      if (!(err instanceof TypeError)) throw err;
      return fetch(url, { method: "PUT", body: new Blob([blob]) });
    }
  }

  async function uploadPoster(fileId: string): Promise<string | null> {
    const poster = compressor.getResult(fileId)?.poster;
    const videoKey = keys.get(fileId);
    if (!poster || !videoKey) return null;
    try {
      const res = await lifecycle(fileId, "put_url", () =>
        axios.post(
          "/api/s3/put-url",
          {
            challengeId,
            filename: "poster.jpg",
            contentType: "image/jpeg",
            purpose: "poster",
            videoKey,
            ...sandboxBody,
          },
          { headers: headersFor(fileId) },
        ),
      );
      const { url, publicUrl, headers } = res.data as {
        url: string;
        publicUrl: string;
        headers: Record<string, string>;
      };
      await lifecycle(fileId, "poster_put", async () => {
        const put = await putBlob(url, poster.blob, headers);
        if (!put.ok) {
          throw Object.assign(new Error(`Poster upload failed (${put.status})`), {
            source: { status: put.status },
          });
        }
      });
      return publicUrl;
    } catch (err) {
      track(
        "poster_upload_failed",
        telemetry(fileId, {
          level: "warn",
          errorCode: String(httpStatus(err)),
          errorMessage: errorMessage(err),
        }),
      );
      return null;
    }
  }

  return {
    uppy,
    compressor,
    config,
    attemptIdFor,
    getUploadedKey: (fileId) => keys.get(fileId),
    uploadPoster,
    setFaults: (next) => {
      faults = next;
    },
    destroy: () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      }
      uppy.destroy();
    },
  };
}
