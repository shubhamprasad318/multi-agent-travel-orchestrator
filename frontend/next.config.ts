import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Destination cover photos come from Wikimedia (see lib/destinationImage.ts).
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "thumb.wikimedia.org" },
    ],
  },
};

export default nextConfig;
