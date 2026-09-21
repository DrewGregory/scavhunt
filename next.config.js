/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  // Ensure SF topology seed is traced into the standalone server bundle.
  outputFileTracingIncludes: {
    "/api/admin/import-boundaries": [
      "./data/sf-topology.json",
      "./data/sf-datasf-117.json",
    ],
  },
  // Lint in CI/local; skip during image builds (saves ~30–45s on Dokku).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
