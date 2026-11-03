import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// What the browser may load. Sent as "Report-Only" for now: nothing is
// blocked, the browser just warns in the console. See the PR for when to enforce.
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline': Next's own inline scripts (no nonce, see the PR).
  // 'wasm-unsafe-eval' + jsdelivr: the AI models' WebAssembly runtime.
  // 'unsafe-eval' only in `next dev` (hot reload needs it).
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""} https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  // Model files (Hugging Face and its download hosts) and the runtime's .wasm.
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  // Sign-in posts to us, then redirects to Google.
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: CSP },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "geolocation=(self)",
      "clipboard-read=(self)",
      "clipboard-write=(self)",
      "microphone=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "hid=()",
      "midi=()",
      "display-capture=()",
    ].join(", "),
  },
  // Same value Vercel sends by default, so the two never disagree.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Keep the whole site out of search engines (pages, images and API).
          { key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
