import type { NextConfig } from "next";

const nextConfig: any = {
  output: 'export',
  basePath: '/ADHDice2',
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
