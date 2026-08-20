import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';
const isProductionBuild = process.env.NODE_ENV === 'production';
const basePath = isCapacitorBuild ? '' : isProductionBuild ? '/ADHDice2' : '';

const nextConfig: any = {
  ...(isProductionBuild ? { output: 'export' } : {}),
  basePath,
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ["127.0.0.1", "192.168.4.109", "192.168.4.98"],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
