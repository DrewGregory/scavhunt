import type { AudioCodecChoice, VideoCodecChoice } from "../upload/config";

export type CodecSupport = {
  video: Record<VideoCodecChoice, boolean>;
  audio: Record<AudioCodecChoice, boolean>;
};

export const VIDEO_CODEC_LABELS: Record<VideoCodecChoice, string> = {
  avc: "H.264 (plays everywhere)",
  hevc: "HEVC / H.265",
  vp9: "VP9",
  av1: "AV1",
};

/** Encoder availability in this browser (via Mediabunny → WebCodecs isConfigSupported). */
export async function detectCodecSupport(width = 1280, height = 720): Promise<CodecSupport> {
  const none: CodecSupport = {
    video: { avc: false, hevc: false, vp9: false, av1: false },
    audio: { aac: false, opus: false },
  };
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined") return none;
  const { canEncodeVideo, canEncodeAudio } = await import("mediabunny");
  const out = none;
  await Promise.all([
    ...(Object.keys(out.video) as VideoCodecChoice[]).map(async (c) => {
      out.video[c] = await canEncodeVideo(c, { width, height }).catch(() => false);
    }),
    ...(Object.keys(out.audio) as AudioCodecChoice[]).map(async (c) => {
      out.audio[c] = await canEncodeAudio(c).catch(() => false);
    }),
  ]);
  return out;
}
