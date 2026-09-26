/**
 * Media URL helpers: CDN rewrite for legacy Spaces origin URLs, plus
 * image/video extension checks used by the feed and players.
 */

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(?:\?|#|$)/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic)(?:\?|#|$)/i;

/**
 * Rewrites a DigitalOcean Spaces origin URL to the CDN host for our bucket.
 *
 * New uploads already store CDN URLs; older Submission rows may still have
 * `https://{bucket}.{region}.digitaloceanspaces.com/...`. Already-CDN URLs
 * and URLs for other hosts are left untouched. Returns null for null/empty.
 * If SPACES_BUCKET_NAME / SPACES_REGION are missing, returns the input unchanged.
 */
export function toCdnUrl(url: string | null | undefined): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const bucket = process.env.SPACES_BUCKET_NAME;
  const region = process.env.SPACES_REGION;
  if (!bucket || !region) return trimmed;

  const originHost = `${bucket}.${region}.digitaloceanspaces.com`;
  const cdnHost = `${bucket}.${region}.cdn.digitaloceanspaces.com`;

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === originHost) {
      parsed.hostname = cdnHost;
      return parsed.toString();
    }
  } catch {
    // Not a parseable absolute URL — leave as-is.
  }

  return trimmed;
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT.test(url);
}

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return IMAGE_EXT.test(url);
}
