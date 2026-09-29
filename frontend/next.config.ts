import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js"]
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 390, 414, 520, 640, 750, 828, 1080],
    imageSizes: [24, 32, 44, 52, 64, 88, 128, 176, 220, 260, 320, 420, 520],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    unoptimized: false
  },
  async headers() {
    return [
      {
        source: "/:path*.(png|jpg|jpeg|webp|avif|gif|svg|ttf|woff2|woff|mp4)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer-when-downgrade"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
