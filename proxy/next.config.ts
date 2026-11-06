import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the gitignored, prebuilt address index (scripts/build-index.ts) with the resolve function.
  outputFileTracingIncludes: { "/api/resolve": ["./.data/**/*"] },
};

export default nextConfig;
