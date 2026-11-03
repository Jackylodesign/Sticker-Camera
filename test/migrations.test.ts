// The migrations folder and the runner in scripts/migrate.mjs.

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listMigrations, migrate, MIGRATIONS_DIR, splitStatements } from "../scripts/migrate.mjs";

/** A fake Neon `sql` with `query` and `transaction`. `fail` makes a transaction throw when it contains that text. */
function fakeSql(applied: string[], { tableExists = true, fail = "" } = {}) {
  const ran: string[] = [];
  const query = vi.fn((text: string, params: unknown[] = []) => {
    const rows: Record<string, unknown>[] = text.includes("to_regclass")
      ? [{ exists: tableExists }]
      : text.startsWith("SELECT name")
        ? applied.map((name) => ({ name }))
        : [];
    // Remember the text so the fake transaction can see what it was given.
    return Object.assign(Promise.resolve(rows), { text, params });
  });
  const transaction = vi.fn(async (queries: Promise<unknown>[]) => {
    const texts = (queries as unknown as { text: string; params: unknown[] }[]).map((q) =>
      q.text.startsWith("INSERT INTO schema_migrations") ? `record ${q.params[0]}` : q.text,
    );
    if (fail && texts.some((t) => t.includes(fail))) throw new Error("boom");
    ran.push(...texts);
  });
  return { sql: { query, transaction }, ran };
}

function tempMigrations(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const quiet = () => {};

describe("migrations folder", () => {
  const names = listMigrations();

  it("is numbered 0001, 0002, … with no gaps or duplicates", () => {
    expect(names.length).toBeGreaterThanOrEqual(4);
    names.forEach((name, i) =>
      expect(name).toMatch(new RegExp(`^${String(i + 1).padStart(4, "0")}_[a-z0-9_]+\\.sql$`)),
    );
    expect(names.slice(0, 4)).toEqual([
      "0001_create_stickers.sql",
      "0002_add_display_pathname.sql",
      "0003_create_api_tokens.sql",
      "0004_add_date_and_location.sql",
    ]);
  });

  it("rejects gaps, duplicates and bad names", () => {
    expect(() => listMigrations(tempMigrations({ "0001_a.sql": "", "0003_c.sql": "" }))).toThrow(/number 2/);
    expect(() => listMigrations(tempMigrations({ "0001_a.sql": "", "0001_b.sql": "" }))).toThrow(/number 2/);
    expect(() => listMigrations(tempMigrations({ "1_a.sql": "" }))).toThrow(/Bad migration name/);
  });

  describe.each(names)("%s", (name) => {
    const text = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    const statements = splitStatements(text);

    it("starts with a comment saying why it exists", () => {
      expect(text).toMatch(/^-- \S/);
    });

    it("only uses statements that are safe to run again", () => {
      expect(statements.length).toBeGreaterThan(0);
      for (const s of statements) {
        const sql = s.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toUpperCase();
        if (/^CREATE (UNIQUE )?INDEX/.test(sql)) expect(sql).toMatch(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS /);
        else if (sql.startsWith("CREATE TABLE")) expect(sql).toMatch(/^CREATE TABLE IF NOT EXISTS /);
        else if (sql.startsWith("ALTER TABLE")) {
          expect(sql).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER COLUMN\b/);
          expect(sql).toMatch(/\bADD COLUMN IF NOT EXISTS /);
          expect(sql).not.toMatch(/\bADD\b(?! COLUMN IF NOT EXISTS )/);
        } else if (sql.startsWith("UPDATE")) expect(sql).toMatch(/ WHERE .* IS NULL$/);
        else throw new Error(`Not on the safe list, check it by hand and extend this test: ${s}`);
      }
    });
  });
});

describe("splitStatements", () => {
  it("splits on ; but not inside quotes, $$ blocks or comments", () => {
    const text = `-- one; still a comment
      CREATE TABLE a (x text DEFAULT 'a;b''c');
      /* two; */ SELECT "we;ird";
      DO $$ BEGIN PERFORM 1; END $$;
      -- trailing comment only`;
    expect(splitStatements(text)).toEqual([
      "-- one; still a comment\n      CREATE TABLE a (x text DEFAULT 'a;b''c')",
      `/* two; */ SELECT "we;ird"`,
      "DO $$ BEGIN PERFORM 1; END $$",
    ]);
  });
});

describe("migrate", () => {
  const dir = tempMigrations({
    "0001_one.sql": "CREATE TABLE IF NOT EXISTS one (id int);",
    "0002_two.sql": "CREATE TABLE IF NOT EXISTS two (id int);\nCREATE INDEX IF NOT EXISTS two_idx ON two (id);",
    "0003_three.sql": "CREATE TABLE IF NOT EXISTS three (id int);",
  });

  it("creates the tracking table and skips names already applied", async () => {
    const { sql, ran } = fakeSql(["0001_one.sql"]);
    const lines: string[] = [];
    const result = await migrate(sql, { dir, log: (l) => lines.push(l) });

    expect(sql.query.mock.calls[0][0]).toMatch(/^CREATE TABLE IF NOT EXISTS schema_migrations/);
    expect(result).toEqual(["0002_two.sql", "0003_three.sql"]);
    // Each file is one transaction: its statements, then its record.
    expect(sql.transaction).toHaveBeenCalledTimes(2);
    expect(ran).toEqual([
      "CREATE TABLE IF NOT EXISTS two (id int)",
      "CREATE INDEX IF NOT EXISTS two_idx ON two (id)",
      "record 0002_two.sql",
      "CREATE TABLE IF NOT EXISTS three (id int)",
      "record 0003_three.sql",
    ]);
    expect(lines.join("\n")).toMatch(/already applied +0001_one.sql[\s\S]*ran +0002_two.sql[\s\S]*Done: 2/);
  });

  it("stops at the first failure", async () => {
    const { sql, ran } = fakeSql([], { fail: "two" });
    await expect(migrate(sql, { dir, log: quiet })).rejects.toThrow(/0002_two.sql failed.*boom/);
    expect(ran).toEqual(["CREATE TABLE IF NOT EXISTS one (id int)", "record 0001_one.sql"]);
    expect(sql.transaction).toHaveBeenCalledTimes(2); // 0003 never tried
  });

  it("does nothing when everything is applied", async () => {
    const { sql } = fakeSql(["0001_one.sql", "0002_two.sql", "0003_three.sql"]);
    expect(await migrate(sql, { dir, log: quiet })).toEqual([]);
    expect(sql.transaction).not.toHaveBeenCalled();
  });

  it("dry run lists pending files and changes nothing", async () => {
    const { sql } = fakeSql(["0001_one.sql"]);
    const lines: string[] = [];
    expect(await migrate(sql, { dir, dryRun: true, log: (l) => lines.push(l) })).toEqual([
      "0002_two.sql",
      "0003_three.sql",
    ]);
    expect(sql.transaction).not.toHaveBeenCalled();
    expect(sql.query.mock.calls.map((c) => c[0]).every((t) => t.startsWith("SELECT"))).toBe(true);
    expect(lines.join("\n")).toMatch(/would run +0002_two.sql[\s\S]*Nothing was changed/);
  });

  it("dry run on a fresh database does not create the tracking table", async () => {
    const { sql } = fakeSql([], { tableExists: false });
    expect(await migrate(sql, { dir, dryRun: true, log: quiet })).toHaveLength(3);
    expect(sql.query).toHaveBeenCalledTimes(1);
  });
});
