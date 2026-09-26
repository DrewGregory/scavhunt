import type { SerializedSubmission, SerializedTeam } from "./types";

export type FeedStatus = "pending" | "accepted" | "rejected";

export type FeedFilters = {
  challengeId?: string;
  teamId?: string;
  status?: FeedStatus;
  mediaOnly?: boolean;
  videoOnly?: boolean;
  favoritedOnly?: boolean;
  q?: string;
};

export type FeedItem = SerializedSubmission & {
  favoriteCount: number;
  favorited: boolean;
  /** Position among non-rejected submissions for the challenge (oldest = 1); null when rejected. */
  submissionNumber: number | null;
};

export type FeedChallenge = {
  id: string;
  title: string;
  emoji: string | null;
  pts: number;
  numWinners: number;
  acceptedCount: number;
  pendingCount: number;
  totalCount: number;
};

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
  teams: Record<string, SerializedTeam>;
  challenges: Record<string, FeedChallenge>;
};

export const FEED_DEFAULT_LIMIT = 20;
export const FEED_MAX_LIMIT = 50;

export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "m4v",
  "mpg",
  "mp2",
  "mpeg",
  "mpe",
  "mpv",
];

const VIDEO_RE = new RegExp(`\\.(${VIDEO_EXTENSIONS.join("|")})$`, "i");
const IMAGE_RE = /\.(jpg|jpeg|png|gif|webp|heic|avif)$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && VIDEO_RE.test(url.split(/[?#]/)[0]);
}

export function isImageUrl(url: string | null | undefined): boolean {
  return !!url && IMAGE_RE.test(url.split(/[?#]/)[0]);
}

export function feedQueryString(
  filters: FeedFilters,
  extra: { cursor?: string | null; limit?: number } = {},
): string {
  const p = new URLSearchParams();
  if (filters.challengeId) p.set("challengeId", filters.challengeId);
  if (filters.teamId) p.set("teamId", filters.teamId);
  if (filters.status) p.set("status", filters.status);
  if (filters.mediaOnly) p.set("mediaOnly", "1");
  if (filters.videoOnly) p.set("videoOnly", "1");
  if (filters.favoritedOnly) p.set("favoritedOnly", "1");
  if (filters.q?.trim()) p.set("q", filters.q.trim());
  if (extra.limit) p.set("limit", String(extra.limit));
  if (extra.cursor) p.set("cursor", extra.cursor);
  return p.toString();
}
