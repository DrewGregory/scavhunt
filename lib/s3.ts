import { S3Client } from "@aws-sdk/client-s3";

export type SpacesConfig = {
  bucket: string;
  region: string;
  endpoint: string;
  client: S3Client;
  /** Public CDN URL for an object key (preserves path separators). */
  publicUrl: (key: string) => string;
};

/**
 * Builds a shared DigitalOcean Spaces S3 client.
 *
 * Returns null if any required Spaces env var is missing.
 *
 * The `requestChecksumCalculation` / `responseChecksumValidation` overrides
 * matter: the AWS SDK defaults to `WHEN_SUPPORTED`, which attaches CRC32
 * checksum headers to upload requests. DigitalOcean Spaces rejects those on
 * `CreateMultipartUpload` (and other operations) with `InvalidArgument`.
 * Forcing `WHEN_REQUIRED` makes the SDK only add checksums when the API
 * requires them.
 */
export function getSpacesConfig(): SpacesConfig | null {
  const bucket = process.env.SPACES_BUCKET_NAME;
  const region = process.env.SPACES_REGION;
  const endpoint = process.env.SPACES_ENDPOINT;
  const accessKeyId = process.env.SPACES_KEY;
  const secretAccessKey = process.env.SPACES_SECRET;

  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    region,
    endpoint,
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return {
    bucket,
    region,
    endpoint,
    client,
    publicUrl: (key: string) =>
      `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
  };
}
