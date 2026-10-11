import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "bullmq", "ioredis", "pixelmatch", "pngjs"],
};

export default nextConfig;
