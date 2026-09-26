import {
  PRODUCTION_UPLOAD_CONFIG,
  mergeUploadConfig,
  type DeepPartial,
  type UploadConfig,
} from "../upload/config";

export type Preset = { id: string; label: string; config: UploadConfig };

function preset(id: string, label: string, overrides: DeepPartial<UploadConfig>): Preset {
  return { id, label, config: mergeUploadConfig(PRODUCTION_UPLOAD_CONFIG, overrides) };
}

export const PRESETS: Preset[] = [
  preset("480p", "480p · 1.2 Mbps", { video: { maxLongEdge: 854, bitrate: 1_200_000 } }),
  { id: "720p", label: "720p · 2.5 Mbps (production default)", config: PRODUCTION_UPLOAD_CONFIG },
  preset("1080p", "1080p · 5 Mbps", { video: { maxLongEdge: 1920, bitrate: 5_000_000 } }),
  preset("none", "No compression", { video: { enabled: false }, image: { enabled: false } }),
];

export const RETRY_PRESETS: Array<{ id: string; label: string; delays: number[] }> = [
  { id: "default", label: "Default (0,1,3,5s)", delays: [0, 1000, 3000, 5000] },
  { id: "patient", label: "Patient (0…60s)", delays: [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000] },
  { id: "none", label: "No retries", delays: [] },
];

export function describeConfig(c: UploadConfig): string {
  const v = c.video;
  const video = v.enabled
    ? `${v.maxLongEdge ?? "orig"}px ${v.codec} ${
        typeof v.bitrate === "number" ? `${(v.bitrate / 1e6).toFixed(1)}Mbps` : v.bitrate
      }`
    : "no video compression";
  const t = c.transport;
  return `${video} · part ${t.partSizeMB}MB ×${t.concurrency}`;
}

export function presetIdFor(c: UploadConfig): string | null {
  const json = JSON.stringify(c);
  return PRESETS.find((p) => JSON.stringify(p.config) === json)?.id ?? null;
}
