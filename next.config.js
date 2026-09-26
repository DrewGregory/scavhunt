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
  /**
   * Tree-shake barrel imports so pages don't pull entire icon/UI packages.
   * Next 15 already optimizes date-fns + react-icons/* by default; Chakra is
   * the main gap for this app.
   */
  experimental: {
    optimizePackageImports: ["@chakra-ui/react", "@chakra-ui/icons"],
  },
};

module.exports = nextConfig;
