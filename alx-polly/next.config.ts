import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Silence multiple lockfiles warning by telling Next the tracing root
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
};

export default nextConfig;
