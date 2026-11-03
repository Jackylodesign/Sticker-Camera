import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/…" imports as tsconfig.json.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Server code runs in Node. Nothing here needs a browser DOM.
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    // Mocks the database, Blob, sign-in and the network for every test.
    setupFiles: ["test/setup.ts"],
    unstubGlobals: true,
  },
});
