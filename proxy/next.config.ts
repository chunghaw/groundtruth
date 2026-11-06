import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second local build/run coexist with a running server (e.g. NEXT_DIST_DIR=.next-alt). Default unchanged.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Ship the gitignored, prebuilt address index (scripts/build-index.ts) with the resolve function.
  outputFileTracingIncludes: { "/api/resolve": ["./.data/**/*"] },
};

export default nextConfig;
