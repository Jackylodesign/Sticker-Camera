// Shared fakes for the database, Blob storage and sign-in.
// test/setup.ts plugs them in; tests import them to set answers and check calls.

import { vi } from "vitest";

export type Query = { text: string; values: unknown[] };

/** Every query the fake `sql` tag received, in order. */
export const queries: Query[] = [];

let answer: (q: Query) => unknown[] = () => [];

/** Sets what the fake database returns. Gets each query's text (one line). */
export function dbAnswers(fn: (q: Query) => unknown[]) {
  answer = fn;
}

/** The fake `sql` tag: records the query, returns rows from dbAnswers. */
export const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  const q = { text: strings.join("?").replace(/\s+/g, " ").trim(), values };
  queries.push(q);
  return Promise.resolve(answer(q));
});

/** Fake @vercel/blob. */
export const blob = {
  put: vi.fn(async (pathname: string) => ({ pathname: pathname.replace(".png", "-abc123.png") })),
  get: vi.fn<
    (pathname: string, opts?: unknown) => Promise<{ statusCode: number; stream: ReadableStream | null } | null>
  >(async () => ({
    statusCode: 200,
    stream: new Response("png-bytes").body,
  })),
  del: vi.fn<(pathnames: string | string[]) => Promise<void>>(async () => {}),
};

/** Fake Auth.js `auth()`: returns the session set by signIn. */
export const auth = vi.fn(async (): Promise<{ user: { email: string } } | null> => null);

export const OWNER = "owner@example.com";

/** Pretends someone is signed in (or nobody, with null). */
export function signedInAs(email: string | null) {
  auth.mockImplementation(async () => (email ? { user: { email } } : null));
}

/** The config auth.ts passed to NextAuth(), so tests can call its callbacks. */
export const nextAuth: { config?: unknown } = {};

export function resetMocks() {
  queries.length = 0;
  answer = () => [];
  sql.mockClear();
  for (const fn of Object.values(blob)) fn.mockClear();
  signedInAs(null);
}
