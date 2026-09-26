import { useCallback, useEffect, useRef, type RefObject } from "react";
import { track } from "./telemetry";

export type PlaybackInfo = {
  submissionId: string;
  challengeId: string;
  source: "feed" | "scavtok";
  compressed: boolean | null;
  sizeBytes: number | null;
};

export type PlayTrigger = "tap" | "current";

/**
 * Emits video_first_frame (play intent -> 'playing'), video_stall ('waiting' -> 'playing')
 * and video_error for a single <video>. Returns `markPlayIntent`.
 */
export function usePlaybackTelemetry(
  videoRef: RefObject<HTMLVideoElement | null>,
  info: PlaybackInfo,
) {
  const infoRef = useRef(info);
  infoRef.current = info;
  const intent = useRef<{
    at: number;
    trigger: PlayTrigger;
    readyState: number;
    preload: string;
  } | null>(null);
  const firstFrameDone = useRef(false);
  const stallStart = useRef<number | null>(null);

  const markPlayIntent = useCallback(
    (trigger: PlayTrigger) => {
      const v = videoRef.current;
      if (!v || firstFrameDone.current || intent.current) return;
      intent.current = {
        at: performance.now(),
        trigger,
        readyState: v.readyState,
        preload: v.preload,
      };
    },
    [videoRef],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const base = () => {
      const i = infoRef.current;
      return {
        submissionId: i.submissionId,
        challengeId: i.challengeId,
        bytes: i.sizeBytes ?? undefined,
      };
    };
    const meta = (extra: Record<string, unknown> = {}) => ({
      source: infoRef.current.source,
      compressed: infoRef.current.compressed,
      ...extra,
    });

    const reportStall = (resolved: boolean) => {
      if (stallStart.current == null) return;
      track("video_stall", {
        ...base(),
        level: "warn",
        durationMs: Math.round(performance.now() - stallStart.current),
        meta: meta({ resolved, currentTime: v.currentTime }),
      });
      stallStart.current = null;
    };

    const onPlaying = () => {
      reportStall(true);
      const i = intent.current;
      if (i && !firstFrameDone.current) {
        firstFrameDone.current = true;
        intent.current = null;
        track("video_first_frame", {
          ...base(),
          durationMs: Math.round(performance.now() - i.at),
          meta: meta({
            trigger: i.trigger,
            readyStateAtIntent: i.readyState,
            preloadAtIntent: i.preload,
          }),
        });
      }
    };
    const onWaiting = () => {
      if (!firstFrameDone.current || v.seeking) return;
      if (stallStart.current == null) stallStart.current = performance.now();
    };
    const onPause = () => {
      reportStall(false);
      if (!firstFrameDone.current) intent.current = null;
    };
    const onEmptied = () => {
      reportStall(false);
      firstFrameDone.current = false;
      intent.current = null;
    };
    const onError = () => {
      const err = v.error;
      if (!err || !v.getAttribute("src")) return;
      intent.current = null;
      track("video_error", {
        ...base(),
        level: "error",
        errorCode: String(err.code),
        errorMessage: err.message || undefined,
        meta: meta({ networkState: v.networkState }),
      });
    };

    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("pause", onPause);
    v.addEventListener("emptied", onEmptied);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("emptied", onEmptied);
      v.removeEventListener("error", onError);
    };
  }, [videoRef]);

  return markPlayIntent;
}
