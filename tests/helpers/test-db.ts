/**
 * Test database helper.
 *
 * Tests must never touch `./autoorg.db` and must never hand-roll their own
 * `CREATE TABLE` — doing so hides schema drift (a test-local `objections` table
 * masked the fact that the real migration never created one).
 *
 * `useTestDb()` provisions a throwaway database built by the *real* migration
 * runner, so tests exercise the same schema users get.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let dir: string | null = null;

/**
 * Point AUTOORG_DB_PATH at a fresh temp database and migrate it.
 * Call from `beforeAll`. Returns the database path.
 */
export async function useTestDb(prefix = 'autoorg-test-'): Promise<string> {
  dir = mkdtempSync(path.join(tmpdir(), prefix));
  const dbPath = path.join(dir, 'test.db');
  process.env.AUTOORG_DB_PATH = dbPath;

  const { migrate } = await import('../../src/db/migrate.ts');
  await migrate();

  return dbPath;
}

/** Remove the temp database. Call from `afterAll`. */
export function cleanupTestDb(): void {
  delete process.env.AUTOORG_DB_PATH;
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = null;
  }
}

/** A run id unique to this test process, so rows never collide. */
export function testRunId(label = 'test'): string {
  return `${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
