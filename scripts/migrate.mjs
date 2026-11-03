// Runs the SQL files in migrations/ that the database has not seen yet.
// Each file runs in its own transaction and is then recorded in schema_migrations.
// Run: npm run db:migrate              (reads DATABASE_URL from .env.local or the environment)
//      npm run db:migrate -- --dry-run (only lists what would run)

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Migration file names in order. Throws on a bad name, a gap or a duplicate number. */
export function listMigrations(dir = MIGRATIONS_DIR) {
  const names = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  names.forEach((name, i) => {
    const match = NAME.exec(name);
    if (!match) throw new Error(`Bad migration name: ${name} (expected e.g. 0005_add_something.sql)`);
    if (Number(match[1]) !== i + 1) throw new Error(`Migration ${name} should be number ${i + 1}`);
  });
  return names;
}

/**
 * Splits a SQL file into single statements on `;`, ignoring semicolons inside
 * quotes, $$ blocks and comments. Comment-only pieces are dropped.
 */
export function splitStatements(text) {
  const statements = [];
  let current = "";
  let hasCode = false;
  let i = 0;
  const push = () => {
    if (hasCode) statements.push(current.trim());
    current = "";
    hasCode = false;
  };
  while (i < text.length) {
    const rest = text.slice(i);
    let end; // index just after the token that starts at i
    if (rest.startsWith("--")) {
      end = text.indexOf("\n", i);
      end = end === -1 ? text.length : end;
    } else if (rest.startsWith("/*")) {
      end = text.indexOf("*/", i + 2);
      end = end === -1 ? text.length : end + 2;
    } else if (rest[0] === "'" || rest[0] === '"') {
      // A doubled quote ('' or "") is an escaped quote and stays inside.
      end = i + 1;
      while (end < text.length) {
        if (text[end] === rest[0]) {
          if (text[end + 1] === rest[0]) end += 2;
          else break;
        } else end++;
      }
      end = Math.min(end + 1, text.length);
      hasCode = true;
    } else if (/^\$[A-Za-z_]*\$/.test(rest)) {
      const tag = /^\$[A-Za-z_]*\$/.exec(rest)[0];
      end = text.indexOf(tag, i + tag.length);
      end = end === -1 ? text.length : end + tag.length;
      hasCode = true;
    } else if (rest[0] === ";") {
      push();
      i++;
      continue;
    } else {
      end = i + 1;
      if (!/\s/.test(rest[0])) hasCode = true;
    }
    current += text.slice(i, end);
    i = end;
  }
  push();
  return statements;
}

/**
 * Runs pending migrations with a Neon `sql` function. Stops at the first error.
 * Returns the names that ran (or would run, with dryRun).
 */
export async function migrate(sql, { dir = MIGRATIONS_DIR, dryRun = false, log = console.log } = {}) {
  const names = listMigrations(dir);

  let applied = new Set();
  if (dryRun) {
    // Don't create the table in a dry run; just check whether it is there.
    const [{ exists }] = await sql.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS exists");
    if (exists) applied = new Set((await sql.query("SELECT name FROM schema_migrations")).map((r) => r.name));
  } else {
    await sql.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    applied = new Set((await sql.query("SELECT name FROM schema_migrations")).map((r) => r.name));
  }

  const pending = names.filter((name) => !applied.has(name));
  for (const name of names) if (applied.has(name)) log(`  already applied  ${name}`);
  if (pending.length === 0) {
    log("Nothing to run. The database is up to date.");
    return [];
  }

  for (const name of pending) {
    if (dryRun) {
      log(`  would run        ${name}`);
      continue;
    }
    const statements = splitStatements(readFileSync(`${dir}/${name}`, "utf8"));
    try {
      await sql.transaction([
        ...statements.map((s) => sql.query(s)),
        sql.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]),
      ]);
    } catch (err) {
      log(`  FAILED           ${name}`);
      throw new Error(`Migration ${name} failed, nothing from it was saved: ${err.message}`, { cause: err });
    }
    log(`  ran              ${name}`);
  }

  log(
    dryRun
      ? `Dry run: ${pending.length} migration(s) would run. Nothing was changed.`
      : `Done: ${pending.length} migration(s) ran.`,
  );
  return pending;
}

// Only when run as a script (not when a test imports this file).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is missing. Put it in .env.local (or the DATABASE_URL secret on GitHub).");
    process.exit(1);
  }
  const { neon } = await import("@neondatabase/serverless");
  try {
    await migrate(neon(url), { dryRun: process.argv.includes("--dry-run") });
  } catch (err) {
    // Never print the connection string, even if an error message contains it.
    console.error(String(err.message).replaceAll(url, "[DATABASE_URL]"));
    process.exit(1);
  }
}
