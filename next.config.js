/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  // Lint in CI/local; skip during image builds (saves ~30–45s on Dokku).
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
