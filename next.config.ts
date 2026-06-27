import type { NextConfig } from "next";

const nextConfig: any = {
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  basePath: process.env.NODE_ENV === 'production' ? '/ADHDice2' : '',
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["127.0.0.1", "192.168.4.109", "192.168.4.98"],
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.NODE_ENV === 'production' ? '/ADHDice2' : '',
  },
};

export default nextConfig;
