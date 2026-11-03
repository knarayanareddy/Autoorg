/**
 * Schema ↔ code contract test.
 *
 * Runs the real migration into a throwaway database, then asserts that every
 * statically-analysable INSERT/UPDATE in `src/` targets a table and column that
 * actually exists.
 *
 * This is the guardrail that keeps the schema from drifting away from the code
 * again: it fails CI on "no such table" / "no such column" bugs before they
 * reach a user's first cycle.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { migrate } from '../src/db/migrate.ts';
import {
  findSchemaViolations,
  readSchema,
  extractSqlLiterals,
  checkSqlAgainstSchema,
} from './helpers/sql-contract.ts';

let dir: string;
let dbPath: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'autoorg-schema-'));
  dbPath = path.join(dir, 'schema.db');
  process.env.AUTOORG_DB_PATH = dbPath;
  await migrate();
});

afterAll(() => {
  delete process.env.AUTOORG_DB_PATH;
  rmSync(dir, { recursive: true, force: true });
});

describe('Schema ↔ code contract', () => {
  it('migration produces the tables the runtime depends on', () => {
    const db = new Database(dbPath, { readonly: true });
    const schema = readSchema(db);
    db.close();

    // Tables that the orchestrator touches on the very first cycle.
    for (const table of [
      'runs', 'cycles', 'agent_executions', 'objections', 'approvals',
      'tool_executions', 'tool_policies', 'workspace_locks', 'run_checkpoints',
      'redaction_events', 'security_findings', 'action_ledger', 'action_policies',
    ]) {
      expect(schema.has(table)).toBe(true);
    }
  });

  it('every INSERT/UPDATE in src/ targets a real table and column', () => {
    const db = new Database(dbPath, { readonly: true });
    const violations = findSchemaViolations(db);
    db.close();

    const report = violations
      .map(v =>
        v.kind === 'missing-table'
          ? `${v.file}: table "${v.table}" does not exist`
          : `${v.file}: ${v.table}.${v.column} does not exist`
      )
      .join('\n');

    expect(report).toBe('');
  });

  // ── Checker self-tests: prove the guard actually catches drift ──────
  it('detects a missing table', () => {
    const schema = readSchema(new Database(dbPath, { readonly: true }));
    const [v] = checkSqlAgainstSchema(
      'fake.ts',
      'db.prepare(`INSERT INTO nope_table (a, b) VALUES (?, ?)`)',
      schema
    );
    expect(v?.kind).toBe('missing-table');
    expect(v?.table).toBe('nope_table');
  });

  it('detects a missing column', () => {
    const schema = readSchema(new Database(dbPath, { readonly: true }));
    const violations = checkSqlAgainstSchema(
      'fake.ts',
      'db.prepare(`INSERT INTO runs (id, not_a_column) VALUES (?, ?)`)',
      schema
    );
    expect(violations.some(v => v.kind === 'missing-column' && v.column === 'not_a_column')).toBe(true);
  });

  it('detects a bad UPDATE SET column', () => {
    const schema = readSchema(new Database(dbPath, { readonly: true }));
    const violations = checkSqlAgainstSchema(
      'fake.ts',
      'db.prepare(`UPDATE runs SET bogus_column = ? WHERE id = ?`)',
      schema
    );
    expect(violations.some(v => v.column === 'bogus_column')).toBe(true);
  });

  it('ignores dynamic template literals it cannot prove', () => {
    const lits = extractSqlLiterals(
      'db.prepare(`UPDATE kg_nodes SET ${sets.join(", ")} WHERE id = ?`)'
    );
    expect(lits.length).toBe(0);
  });
});

describe('Migration versioning', () => {
  it('records applied versions and is idempotent', async () => {
    const { migrate, getSchemaVersion } = await import('../src/db/migrate.ts');
    const db = new Database(dbPath);

    const first = getSchemaVersion(db);
    expect(first).toBeGreaterThan(0);

    const before = db
      .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
      .get() as { n: number };
    db.close();

    const second = await migrate(); // re-run must be a no-op
    expect(second.alreadyCurrent).toBe(true);
    expect(second.applied).toEqual([]);
    expect(second.columnsAdded).toBe(0);

    const db2 = new Database(dbPath);
    const after = db2
      .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
      .get() as { n: number };
    db2.close();
    expect(after.n).toBe(before.n);
  }, 30_000);

  it('rejects a migration edited after being applied', async () => {
    const { migrate } = await import('../src/db/migrate.ts');
    const { rmSync, copyFileSync, writeFileSync, readFileSync } = await import('node:fs');

    const migrationsDir = path.join(import.meta.dir, '../src/db/migrations');
    const target = path.join(migrationsDir, '001_baseline.sql');
    const backup = `${target}.bak`;

    copyFileSync(target, backup);
    try {
      writeFileSync(target, readFileSync(target, 'utf-8') + '\n-- tampered\n');
      await expect(migrate()).rejects.toThrow(/modified after being applied/);
    } finally {
      copyFileSync(backup, target);
      rmSync(backup, { force: true });
    }
  }, 30_000);
});
