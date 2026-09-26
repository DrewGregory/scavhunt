import type { PosterConfig } from "./config";

export type PosterResult = {
  blob: Blob;
  width: number;
  height: number;
  /** Null for streams without a known duration (e.g. MediaRecorder WebM). */
  durationSec: number | null;
};

/**
 * Grabs a JPEG frame near `atSec` using a hidden <video>, which decodes
 * whatever the browser can play (including HEVC on iOS). Resolves null on any
 * failure or after `timeoutMs`.
 */
export function extractPoster(
  source: Blob,
  config: Pick<PosterConfig, "atSec" | "width" | "quality"> & { timeoutMs?: number },
): Promise<PosterResult | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(source);
    const video = document.createElement("video");
    let settled = false;

    const done = (result: PosterResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => done(null), config.timeoutMs ?? 8000);

    const capture = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return done(null);
      const scale = Math.min(1, config.width / vw);
      const width = Math.max(2, Math.round(vw * scale));
      const height = Math.max(2, Math.round(vh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      try {
        ctx.drawImage(video, 0, 0, width, height);
      } catch {
        return done(null);
      }
      const durationSec = Number.isFinite(video.duration) ? video.duration : null;
      canvas.toBlob(
        (blob) =>
          done(
            blob && blob.size > 0
              ? { blob, width: vw, height: vh, durationSec }
              : null,
          ),
        "image/jpeg",
        config.quality,
      );
    };

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "metadata";
    video.addEventListener("error", () => done(null), { once: true });
    video.addEventListener(
      "loadedmetadata",
      () => {
        const d = video.duration;
        if (!Number.isFinite(d) || d <= 0) {
          // Unknown duration: seeking is unreliable, use the first decoded frame.
          if (video.readyState >= 2) capture();
          else video.addEventListener("loadeddata", capture, { once: true });
          return;
        }
        video.addEventListener("seeked", capture, { once: true });
        video.currentTime = Math.max(0.05, Math.min(config.atSec, d / 2));
      },
      { once: true },
    );
    video.src = url;
    video.load();
  });
}
