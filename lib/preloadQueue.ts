import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Priorities (lower = sooner):
 *   P0 posters on screen
 *   P1 next feed page (fired via `useNearEndTrigger`)
 *   P2 posters within ~2 screens
 *   P3 video buffering for the cards nearest the viewport center
 *   P4 the item after the focused one (open card / current ScavTok video)
 */

export type PreloadMedia = {
  id: string;
  index: number;
  /** Poster (videos) or the photo itself; decoded via the poster pool. */
  posterUrl: string | null;
  videoUrl: string | null;
  hasPoster: boolean;
  compressed: boolean | null;
  sizeBytes: number | null;
};

export type MediaState = { posterReady: boolean };

type VideoLevel = "none" | "metadata" | "auto";

type Entry = {
  media: PreloadMedia;
  el: Element;
  video: HTMLVideoElement | null;
  inRange: boolean;
  onScreen: boolean;
  distance: number;
  onState: (s: MediaState) => void;
};

type PosterLoad = { img: HTMLImageElement; cancelled: boolean };

export type PreloadMode = "feed" | "reel";

const MAX_POSTERS = 6;
const MAX_BUFFERING = 3;
const MAX_STAND_INS = 6;
const REEL_POSTER_WINDOW = 3;
const LARGE_UNCOMPRESSED = 25 * 1024 * 1024;

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (t: "change", cb: () => void) => void;
  removeEventListener?: (t: "change", cb: () => void) => void;
};

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
}

/** Save-Data or 2G/3G: load posters only, never buffer video ahead of intent. */
export function isPosterOnlyNetwork(): boolean {
  const c = connection();
  if (!c) return false;
  if (c.saveData) return true;
  return /(^|-)(2g|3g)$/.test(c.effectiveType ?? "");
}

/** Whether a video may be buffered beyond metadata without user intent. */
export function canAutoBuffer(m: PreloadMedia): boolean {
  if (m.compressed === true) return true;
  if (m.sizeBytes == null) return false;
  return m.sizeBytes <= LARGE_UNCOMPRESSED;
}

export class PreloadQueue {
  readonly mode: PreloadMode;
  onCurrentChange: ((id: string | null) => void) | null = null;

  private entries = new Map<string, Entry>();
  private elToId = new Map<Element, string>();
  private triggers = new Map<Element, () => void>();
  private loadedPosters = new Set<string>();
  private posterLoads = new Map<string, PosterLoad>();
  private focusId: string | null = null;
  private currentId: string | null = null;
  private root: Element | null = null;
  private observer: IntersectionObserver | null = null;
  private rafId: number | null = null;
  private posterOnly = false;
  private attached = false;

  constructor(mode: PreloadMode) {
    this.mode = mode;
  }

  attach(root: Element | null) {
    if (typeof window === "undefined" || this.attached) return;
    this.attached = true;
    this.root = root;
    this.posterOnly = isPosterOnlyNetwork();
    this.observer = new IntersectionObserver(this.handleIntersect, {
      root,
      rootMargin: "200% 0px 200% 0px",
      threshold: 0,
    });
    this.entries.forEach((e) => this.observer!.observe(e.el));
    this.triggers.forEach((_, el) => this.observer!.observe(el));
    (root ?? window).addEventListener("scroll", this.requestSchedule, {
      passive: true,
    });
    window.addEventListener("resize", this.requestSchedule);
    connection()?.addEventListener?.("change", this.handleConnection);
    this.requestSchedule();
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.observer?.disconnect();
    this.observer = null;
    (this.root ?? window).removeEventListener("scroll", this.requestSchedule);
    window.removeEventListener("resize", this.requestSchedule);
    connection()?.removeEventListener?.("change", this.handleConnection);
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.posterLoads.forEach((l) => this.cancelPoster(l));
    this.posterLoads.clear();
  }

  isPosterLoaded(url: string | null): boolean {
    return url != null && this.loadedPosters.has(url);
  }

  register(
    media: PreloadMedia,
    el: Element,
    video: HTMLVideoElement | null,
    onState: (s: MediaState) => void,
  ): () => void {
    const entry: Entry = {
      media,
      el,
      video,
      inRange: false,
      onScreen: false,
      distance: Infinity,
      onState,
    };
    this.entries.set(media.id, entry);
    this.elToId.set(el, media.id);
    this.observer?.observe(el);
    if (this.isPosterLoaded(media.posterUrl)) onState({ posterReady: true });
    this.requestSchedule();
    return () => {
      if (this.entries.get(media.id) !== entry) return;
      this.observer?.unobserve(el);
      this.entries.delete(media.id);
      this.elToId.delete(el);
      this.setVideoLevel(entry, "none", true);
      this.requestSchedule();
    };
  }

  updateIndex(id: string, index: number) {
    const e = this.entries.get(id);
    if (e && e.media.index !== index) {
      e.media = { ...e.media, index };
      this.requestSchedule();
    }
  }

  /** Watches an element and fires `cb` when it enters the ~2-screen range (P1). */
  observeTrigger(el: Element, cb: () => void): () => void {
    this.triggers.set(el, cb);
    this.observer?.observe(el);
    return () => {
      this.triggers.delete(el);
      if (!this.elToId.has(el)) this.observer?.unobserve(el);
    };
  }

  /** The open card (feed) or the current video (reel). Always gets src + auto. */
  setFocus(id: string | null) {
    if (this.focusId === id) return;
    this.focusId = id;
    this.schedule();
  }

  getFocus() {
    return this.focusId;
  }

  private handleConnection = () => {
    this.posterOnly = isPosterOnlyNetwork();
    this.requestSchedule();
  };

  private handleIntersect = (records: IntersectionObserverEntry[]) => {
    for (const r of records) {
      const trigger = this.triggers.get(r.target);
      if (trigger && r.isIntersecting) trigger();
      const id = this.elToId.get(r.target);
      const e = id ? this.entries.get(id) : undefined;
      if (e) e.inRange = r.isIntersecting;
    }
    this.requestSchedule();
  };

  private requestSchedule = () => {
    if (typeof window === "undefined" || this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.schedule();
    });
  };

  private measure() {
    let top = 0;
    let bottom = window.innerHeight;
    if (this.root) {
      const r = this.root.getBoundingClientRect();
      top = r.top;
      bottom = r.bottom;
    }
    const center = (top + bottom) / 2;
    this.entries.forEach((e) => {
      if (!e.inRange) {
        e.onScreen = false;
        e.distance = Infinity;
        return;
      }
      const r = e.el.getBoundingClientRect();
      e.onScreen = r.bottom > top && r.top < bottom;
      e.distance = Math.abs((r.top + r.bottom) / 2 - center);
    });
  }

  private updateCurrent() {
    let best: Entry | null = null;
    this.entries.forEach((e) => {
      if (e.onScreen && (!best || e.distance < best.distance)) best = e;
    });
    const id = (best as Entry | null)?.media.id ?? null;
    if (id == null || id === this.currentId) return;
    this.currentId = id;
    this.focusId = id;
    this.onCurrentChange?.(id);
  }

  private schedule() {
    if (!this.attached) return;
    this.measure();
    if (this.mode === "reel") this.updateCurrent();
    this.schedulePosters();
    this.scheduleVideos();
  }

  private sorted(filter: (e: Entry) => boolean): Entry[] {
    return Array.from(this.entries.values())
      .filter(filter)
      .sort((a, b) => a.distance - b.distance);
  }

  private reelOffset(e: Entry): number | null {
    const focus = this.focusId ? this.entries.get(this.focusId) : undefined;
    if (!focus) return null;
    return e.media.index - focus.media.index;
  }

  private schedulePosters() {
    const wanted = new Map<string, number>();
    this.entries.forEach((e) => {
      const url = e.media.posterUrl;
      if (!url || this.loadedPosters.has(url)) return;
      let priority: number | null = null;
      if (this.mode === "reel") {
        const off = this.reelOffset(e);
        if (off != null && off >= -1 && off <= REEL_POSTER_WINDOW) {
          priority = off === 0 ? 0 : 2 + Math.abs(off);
        } else if (off == null && e.inRange) {
          priority = e.onScreen ? 0 : 2;
        }
      } else if (e.inRange) {
        priority = e.onScreen ? 0 : 2 + e.distance / 1e6;
      }
      if (priority == null) return;
      const prev = wanted.get(url);
      if (prev == null || priority < prev) wanted.set(url, priority);
    });

    this.posterLoads.forEach((load, url) => {
      if (!wanted.has(url)) {
        this.cancelPoster(load);
        this.posterLoads.delete(url);
      }
    });

    const queue = Array.from(wanted.entries())
      .filter(([url]) => !this.posterLoads.has(url))
      .sort((a, b) => a[1] - b[1]);
    for (const [url] of queue) {
      if (this.posterLoads.size >= MAX_POSTERS) break;
      this.startPoster(url);
    }
  }

  private startPoster(url: string) {
    const img = new Image();
    img.decoding = "async";
    const load: PosterLoad = { img, cancelled: false };
    this.posterLoads.set(url, load);
    img.src = url;
    const done = () => {
      if (load.cancelled) return;
      this.posterLoads.delete(url);
      this.loadedPosters.add(url);
      this.entries.forEach((e) => {
        if (e.media.posterUrl === url) e.onState({ posterReady: true });
      });
      this.requestSchedule();
    };
    const decode = typeof img.decode === "function" ? img.decode() : null;
    if (decode) {
      decode.then(done, done);
    } else {
      img.onload = done;
      img.onerror = done;
    }
  }

  private cancelPoster(load: PosterLoad) {
    load.cancelled = true;
    load.img.removeAttribute("src");
  }

  private scheduleVideos() {
    const levels = new Map<string, VideoLevel>();
    const hasVideo = (e: Entry) => e.video != null && e.media.videoUrl != null;

    if (this.mode === "reel") {
      this.entries.forEach((e) => {
        if (!hasVideo(e)) return;
        const off = this.reelOffset(e);
        let level: VideoLevel = "none";
        if (off === 0) level = "auto";
        else if (off === 1)
          level = this.posterOnly
            ? "none"
            : canAutoBuffer(e.media)
              ? "auto"
              : "metadata";
        else if (off === -1) level = this.posterOnly ? "none" : "metadata";
        levels.set(e.media.id, level);
      });
    } else {
      const focus = this.focusId ? this.entries.get(this.focusId) : undefined;
      let slots = MAX_BUFFERING;
      if (focus && hasVideo(focus)) {
        levels.set(focus.media.id, "auto");
        slots--;
      }
      if (!this.posterOnly) {
        const eligible = this.sorted(
          (e) =>
            e.inRange &&
            hasVideo(e) &&
            !levels.has(e.media.id) &&
            canAutoBuffer(e.media),
        );
        const next = focus
          ? eligible.find((e) => e.media.index === focus.media.index + 1)
          : undefined;
        const p3 = eligible.filter((e) => e !== next);
        const take = (e: Entry | undefined) => {
          if (!e || slots <= 0 || levels.has(e.media.id)) return;
          levels.set(e.media.id, "auto");
          slots--;
        };
        p3.slice(0, 2).forEach(take);
        take(next);
        p3.slice(2).forEach(take);

        this.sorted(
          (e) =>
            e.inRange &&
            hasVideo(e) &&
            !e.media.hasPoster &&
            !levels.has(e.media.id),
        )
          .slice(0, MAX_STAND_INS)
          .forEach((e) => levels.set(e.media.id, "metadata"));
      }
    }

    this.entries.forEach((e) => {
      if (hasVideo(e)) this.setVideoLevel(e, levels.get(e.media.id) ?? "none");
    });
  }

  private setVideoLevel(e: Entry, level: VideoLevel, force = false) {
    const v = e.video;
    const url = e.media.videoUrl;
    if (!v || !url) return;
    const current = v.getAttribute("src");
    if (level === "none") {
      if (!current) {
        v.preload = "none";
        return;
      }
      if (!force && !v.paused) return;
      v.preload = "none";
      v.removeAttribute("src");
      v.load();
      return;
    }
    v.preload = level;
    if (!current) {
      v.src = e.media.hasPoster ? url : `${url}#t=0.1`;
    }
  }
}

export function usePreloadQueue(
  mode: PreloadMode,
  opts: {
    rootRef?: RefObject<Element | null>;
    onCurrentChange?: (id: string | null) => void;
  } = {},
): PreloadQueue {
  const [queue] = useState(() => new PreloadQueue(mode));
  const onCurrentChange = opts.onCurrentChange;
  useEffect(() => {
    queue.onCurrentChange = onCurrentChange ?? null;
  }, [queue, onCurrentChange]);
  const rootRef = opts.rootRef;
  useEffect(() => {
    queue.attach(rootRef?.current ?? null);
    return () => queue.detach();
  }, [queue, rootRef]);
  return queue;
}

/** Registers a card with the queue; returns whether its poster has been decoded. */
export function useRegisterMedia(
  queue: PreloadQueue,
  containerRef: RefObject<Element | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  media: PreloadMedia,
): MediaState {
  const [state, setState] = useState<MediaState>(() => ({
    posterReady: queue.isPosterLoaded(media.posterUrl),
  }));
  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return queue.register(
      { ...mediaRef.current },
      el,
      videoRef.current,
      setState,
    );
  }, [
    queue,
    containerRef,
    videoRef,
    media.id,
    media.posterUrl,
    media.videoUrl,
    media.hasPoster,
    media.compressed,
    media.sizeBytes,
  ]);

  useEffect(() => {
    queue.updateIndex(media.id, media.index);
  }, [queue, media.id, media.index]);

  return state;
}

/** Calls `onNear` when `ref` comes within ~2 screens (used for next-page fetch). */
export function useNearEndTrigger(
  queue: PreloadQueue,
  ref: RefObject<Element | null>,
  onNear: () => void,
  enabled: boolean,
) {
  const cbRef = useRef(onNear);
  cbRef.current = onNear;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    return queue.observeTrigger(el, () => cbRef.current());
  }, [queue, ref, enabled]);
}
