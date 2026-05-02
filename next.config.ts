import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-1494790108377-be9c29b29330",
        search: "?auto=format&fit=crop&w=900&q=80",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-1500648767791-00dcc994a43e",
        search: "?auto=format&fit=crop&w=200&q=80",
      },
    ],
  },
};

export default nextConfig;
