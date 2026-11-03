// Runs before each test file. Nothing may touch the real database, Blob,
// Google sign-in or the internet.

import { beforeEach, vi } from "vitest";
import { resetMocks } from "./mocks";

process.env.OWNER_EMAIL = "Owner@Example.com"; // mixed case on purpose
process.env.DATABASE_URL = "postgres://fake";

vi.mock("@neondatabase/serverless", async () => {
  const m = await import("./mocks");
  return { neon: () => m.sql };
});

vi.mock("@vercel/blob", async () => (await import("./mocks")).blob);

vi.mock("next-auth", async () => {
  const m = await import("./mocks");
  return {
    default: (config: unknown) => {
      m.nextAuth.config = config;
      return { handlers: {}, auth: m.auth, signIn: vi.fn(), signOut: vi.fn() };
    },
  };
});
vi.mock("next-auth/providers/google", () => ({ default: {} }));

beforeEach(() => {
  resetMocks();
  // Any real network call fails the test. Tests that need fetch stub it.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }),
  );
});
