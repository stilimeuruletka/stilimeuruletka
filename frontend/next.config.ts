import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 390, 414, 520, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 24, 32, 40, 48, 52, 64, 72, 88, 96, 128, 180, 220, 260, 320],
    minimumCacheTTL: 60 * 60 * 24 * 30
  },
  async headers() {
    return [
      {
        source: "/:path*.(png|jpg|jpeg|webp|avif|gif|svg|mp4)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
