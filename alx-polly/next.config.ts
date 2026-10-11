import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Silence multiple lockfiles warning by telling Next the tracing root
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Set here (not in vercel.json) so they apply under `next start` and on Vercel alike.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
