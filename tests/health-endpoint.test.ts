/**
 * Health endpoint tests.
 *
 * Regression coverage for a liveness probe that opened and CLOSED a database
 * connection on every request while sharing a WAL connection with in-flight
 * work. Under concurrent load that could interrupt another request's
 * transaction. The endpoint must reuse the shared handle and stay cheap.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { withDb, getSharedDb, closeSharedDb } from '../src/db/migrate.ts';
import { useTestDb, cleanupTestDb } from './helpers/test-db.ts';

beforeAll(async () => { await useTestDb('autoorg-health-'); });

afterAll(() => {
  closeSharedDb();
  cleanupTestDb();
});

describe('Shared database connection', () => {
  it('reuses one handle across calls', () => {
    const a = getSharedDb();
    const b = getSharedDb();
    expect(a).toBe(b);
  });

  it('survives many sequential health probes', () => {
    for (let i = 0; i < 200; i++) {
      expect(() => withDb(db => db.prepare('SELECT 1').get())).not.toThrow();
    }
  });

  it('does not close the shared handle between probes', () => {
    const handle = getSharedDb();
    withDb(db => db.prepare('SELECT 1').get());
    // A closed bun:sqlite handle throws on use — this must still work.
    expect(() => handle.prepare('SELECT 1').get()).not.toThrow();
  });

  it('stays fast because it does not reopen per query', () => {
    const n = 300;
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      withDb(db => db.prepare('SELECT 1').get());
    }
    const perQuery = (performance.now() - start) / n;
    // Reused handle is ~0.03ms; open+PRAGMA+close was ~0.47ms.
    expect(perQuery).toBeLessThan(0.2);
  });

  it('reports DB reachability without throwing when the schema is present', () => {
    const ok = (() => {
      try {
        withDb(db => db.prepare('SELECT 1').get());
        return true;
      } catch {
        return false;
      }
    })();
    expect(ok).toBe(true);
  });
});
