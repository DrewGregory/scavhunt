import type { UploadTestRun } from "@prisma/client";
import type { SpacesConfig } from "../s3";

export type StoredObjectUrls = { key: string; cdnUrl: string; originUrl: string };

export type SerializedUploadTestRun = {
  id: string;
  userId: string;
  createdAt: string;
  deviceLabel: string | null;
  connection: string | null;
  fileName: string | null;
  settings: unknown;
  metrics: unknown;
  original: StoredObjectUrls | null;
  compressed: StoredObjectUrls | null;
  poster: StoredObjectUrls | null;
};

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function originUrl(spaces: Pick<SpacesConfig, "bucket" | "region">, key: string): string {
  return `https://${spaces.bucket}.${spaces.region}.digitaloceanspaces.com/${encodeKey(key)}`;
}

function urls(spaces: SpacesConfig | null, key: string | null): StoredObjectUrls | null {
  if (!key || !spaces) return null;
  return { key, cdnUrl: spaces.publicUrl(key), originUrl: originUrl(spaces, key) };
}

export function serializeUploadTestRun(
  run: UploadTestRun,
  spaces: SpacesConfig | null,
): SerializedUploadTestRun {
  return {
    id: run.id,
    userId: run.userId,
    createdAt: run.createdAt.toISOString(),
    deviceLabel: run.deviceLabel,
    connection: run.connection,
    fileName: run.fileName,
    settings: run.settings,
    metrics: run.metrics,
    original: urls(spaces, run.originalKey),
    compressed: urls(spaces, run.compressedKey),
    poster: urls(spaces, run.posterKey),
  };
}
