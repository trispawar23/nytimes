import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Ensure markdown rules ship with the `/api/summarize` server bundle (Vercel / standalone). */
  outputFileTracingIncludes: {
    "/api/summarize": [
      "./lib/editorial-rules.md",
      "./lib/editorial-rules-half-length.md",
    ],
  },
};

export default nextConfig;
