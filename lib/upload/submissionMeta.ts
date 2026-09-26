import { z } from "zod";
import type { SpacesConfig } from "../s3";

const INT_MAX = 2_147_483_647;

const optionalInt = z
  .number()
  .finite()
  .nonnegative()
  .optional()
  .transform((n) => (n == null || n > INT_MAX ? undefined : Math.round(n)));

/** Optional media metadata sent by MediaUploadForm alongside mediaURL. */
export const mediaMetaSchema = z.object({
  posterURL: z.string().max(2048).optional(),
  durationSec: z.number().finite().nonnegative().max(24 * 3600).optional(),
  width: optionalInt,
  height: optionalInt,
  sizeBytes: optionalInt,
  originalSizeBytes: optionalInt,
  compressed: z.boolean().optional(),
});

export type MediaMeta = z.infer<typeof mediaMetaSchema>;

export function spacesMediaUrlRegex(spaces: SpacesConfig): RegExp {
  return new RegExp(
    `^https://${spaces.bucket}\\.${spaces.region}\\.(?:cdn\\.)?digitaloceanspaces\\.com/(.+)/(.+)/(.+)`,
  );
}

export type ParsedMediaMeta = {
  meta: MediaMeta;
  /** Object key of the poster, when a valid posterURL was provided. */
  posterKey: string | null;
  /** Human-readable reasons fields were dropped; empty when everything validated. */
  problems: string[];
};

/**
 * Validates the optional metadata fields. Invalid fields are dropped rather
 * than failing the submission: they are nice-to-have, the media is not.
 */
export function parseMediaMeta(
  body: unknown,
  opts: { spaces: SpacesConfig | null; challengeId: string; teamId: string },
): ParsedMediaMeta {
  const problems: string[] = [];
  const raw = (typeof body === "object" && body != null ? body : {}) as Record<string, unknown>;
  const meta: MediaMeta = {};

  for (const field of Object.keys(mediaMetaSchema.shape) as (keyof MediaMeta)[]) {
    if (raw[field] === undefined || raw[field] === null) continue;
    const parsed = mediaMetaSchema.shape[field].safeParse(raw[field]);
    if (parsed.success) {
      (meta as Record<string, unknown>)[field] = parsed.data;
    } else {
      problems.push(`invalid ${field}`);
    }
  }

  let posterKey: string | null = null;
  if (meta.posterURL) {
    const match = opts.spaces ? meta.posterURL.match(spacesMediaUrlRegex(opts.spaces)) : null;
    if (
      match == null ||
      match[1] !== opts.challengeId ||
      match[2] !== opts.teamId ||
      !match[3].endsWith(".poster.jpg")
    ) {
      problems.push("invalid posterURL");
      delete meta.posterURL;
    } else {
      posterKey = `${opts.challengeId}/${opts.teamId}/${match[3]}`;
    }
  }

  return { meta, posterKey, problems };
}
