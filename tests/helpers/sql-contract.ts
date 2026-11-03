/**
 * SQL ↔ schema contract checker.
 *
 * Extracts statically-analysable SQL from `src/**\/*.ts` and validates every
 * write target (INSERT / UPDATE columns, table names) against the tables that a
 * real `migrate()` run produces.
 *
 * Why this exists: the schema and the code drifted badly enough that a fresh
 * install crashed on its first cycle ("no such table: objections"). Typecheck
 * cannot catch that; only running the DDL against the code's own SQL can.
 *
 * Template literals containing `${...}` are skipped — they are dynamic column /
 * placeholder lists (e.g. `UPDATE t SET ${sets.join(', ')}`) that need a real
 * database to validate, and are covered by the runtime tests instead.
 */

import { readFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { globSync } from 'glob';
import path from 'node:path';

export interface TableSchema {
  columns: Set<string>;
}

export interface Violation {
  file: string;
  kind: 'missing-table' | 'missing-column';
  table: string;
  column?: string;
  statement: string;
}

/** Remove line and block comments so commented-out SQL is not analysed. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Pull SQL out of template literals and single/double quoted strings.
 * Skips literals that contain `${` (dynamic SQL).
 */
export function extractSqlLiterals(src: string): string[] {
  const out: string[] = [];
  const pattern = /`([^`]*)`|'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(src)) !== null) {
    const body = m[1] ?? m[2] ?? m[3] ?? '';
    if (m[1] !== undefined && m[1].includes('${')) continue; // dynamic
    if (/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|FROM)\b/i.test(body)) {
      // Only keep things that look like real SQL, not prose containing "from".
      if (/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(body) ||
          /\bSELECT\b[\s\S]*\bFROM\s+\w+/i.test(body)) {
        out.push(body);
      }
    }
  }
  return out;
}

/** Read every table and its columns from a migrated database. */
export function readSchema(db: Database): Map<string, TableSchema> {
  const tables = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string; sql: string | null }>;

  const schema = new Map<string, TableSchema>();
  for (const { name, sql } of tables) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>;
    const columns = new Set(cols.map(c => c.name.toLowerCase()));
    // FTS5 supports a hidden table-name column for control commands.
    if (sql && /\bUSING\s+fts5\s*\(/i.test(sql)) columns.add(name.toLowerCase());
    schema.set(name.toLowerCase(), { columns });
  }
  return schema;
}

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'null', 'case', 'when', 'then',
  'else', 'end', 'as', 'on', 'join', 'left', 'right', 'inner', 'outer', 'group',
  'order', 'by', 'limit', 'offset', 'distinct', 'values', 'into', 'set',
]);

/**
 * Validate the given source text against a schema map.
 * Only INSERT columns and UPDATE SET columns are checked — those are the write
 * paths that hard-crash at runtime when the schema drifts.
 */
export function checkSqlAgainstSchema(
  file: string,
  source: string,
  schema: Map<string, TableSchema>
): Violation[] {
  const violations: Violation[] = [];
  const src = stripComments(source);

  for (const sql of extractSqlLiterals(src)) {
    // ── INSERT INTO table (cols) ─────────────────────────────────────
    const insert = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]*)\)/i);
    if (insert) {
      const table = insert[1]!.toLowerCase();
      const cols = insert[2]!
        .split(',')
        .map(c => c.trim().replace(/["'`]/g, '').toLowerCase())
        .filter(c => /^[a-z_][a-z0-9_]*$/.test(c));

      const entry = schema.get(table);
      if (!entry) {
        violations.push({ file, kind: 'missing-table', table, statement: sql.trim().slice(0, 90) });
        continue;
      }
      for (const col of cols) {
        if (!entry.columns.has(col)) {
          violations.push({
            file, kind: 'missing-column', table, column: col,
            statement: sql.trim().slice(0, 90),
          });
        }
      }
    }

    // ── UPDATE table SET a = ?, b = ? ────────────────────────────────
    const update = sql.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i);
    if (update) {
      const table = update[1]!.toLowerCase();
      const entry = schema.get(table);
      if (!entry) {
        violations.push({ file, kind: 'missing-table', table, statement: sql.trim().slice(0, 90) });
        continue;
      }
      const assigned = [...update[2]!.matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/gi)]
        .map(m => m[1]!.toLowerCase())
        .filter(c => !SQL_KEYWORDS.has(c));

      for (const col of assigned) {
        if (!entry.columns.has(col)) {
          violations.push({
            file, kind: 'missing-column', table, column: col,
            statement: sql.trim().slice(0, 90),
          });
        }
      }
    }
  }

  return violations;
}

/** Collect source files under src/ (relative to repo root). */
export function sourceFiles(root = process.cwd()): string[] {
  return globSync('src/**/*.ts', { cwd: root }).map(f => path.join(root, f));
}

/** Run the full contract check against an already-migrated database. */
export function findSchemaViolations(db: Database, root = process.cwd()): Violation[] {
  const schema = readSchema(db);
  const all: Violation[] = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf-8');
    all.push(...checkSqlAgainstSchema(path.relative(root, file), source, schema));
  }
  return all;
}
