// Types for migrate.mjs, so the tests can import it.

type Sql = {
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  transaction: (queries: Promise<unknown>[]) => Promise<unknown>;
};

export const MIGRATIONS_DIR: string;
export function listMigrations(dir?: string): string[];
export function splitStatements(text: string): string[];
export function migrate(
  sql: Sql,
  options?: { dir?: string; dryRun?: boolean; log?: (line: string) => void },
): Promise<string[]>;
