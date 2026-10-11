import type { NextConfig } from "next";
import path from "path";
import { SECURITY_HEADERS_STATIC, buildCsp } from "./lib/csp";

const nextConfig: NextConfig = {
  // Silence multiple lockfiles warning by telling Next the tracing root
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Set here (not in vercel.json) so they apply under `next start` and on Vercel alike.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...SECURITY_HEADERS_STATIC,
          { key: "Content-Security-Policy", value: buildCsp(process.env) },
        ],
      },
    ];
  },
};

export default nextConfig;
