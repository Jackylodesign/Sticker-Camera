import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the whole site out of search engines (pages, images and API).
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" }] }];
  },
};

export default nextConfig;
