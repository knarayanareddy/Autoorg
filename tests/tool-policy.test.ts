/**
 * Role → tool permission tests.
 *
 * `ToolPolicy.isAllowed()` existed but was never called, so the seeded matrix
 * (Critic may not sandbox.exec, Archivist may not fetch the web, …) was purely
 * decorative and any role could run any tool.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ToolPolicy } from '../src/tools/tool-policy.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('toolpolicy');

beforeAll(async () => {
  await useTestDb('autoorg-toolpolicy-');
  new ToolPolicy(RUN_ID).seedDefaults();
});

afterAll(() => cleanupTestDb());

describe('ToolPolicy.check', () => {
  it('allows a tool the role is granted', () => {
    const decision = new ToolPolicy(RUN_ID).check({ role: 'Engineer', toolName: 'sandbox.exec' });
    expect(decision.allowed).toBe(true);
    expect(decision.hasPolicy).toBe(true);
  });

  it('denies sandbox.exec to the Critic', () => {
    const decision = new ToolPolicy(RUN_ID).check({ role: 'Critic', toolName: 'sandbox.exec' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Critic');
  });

  it('denies web.fetch to the Archivist', () => {
    const decision = new ToolPolicy(RUN_ID).check({ role: 'Archivist', toolName: 'web.fetch' });
    expect(decision.allowed).toBe(false);
  });

  it('denies an unknown tool to a role that has policies', () => {
    const decision = new ToolPolicy(RUN_ID).check({ role: 'DevilsAdvocate', toolName: 'sandbox.exec' });
    expect(decision.allowed).toBe(false);
  });

  it('defers (allows) for a role with no policies at all, rather than locking it out', () => {
    const decision = new ToolPolicy(RUN_ID).check({ role: 'TotallyUnknownRole', toolName: 'web.fetch' });
    expect(decision.allowed).toBe(true);
    expect(decision.hasPolicy).toBe(false);
    expect(decision.reason).toContain('policy engine');
  });

  it('honours an explicit denial row', () => {
    const policy = new ToolPolicy(RUN_ID);
    // Deny Engineer repo.search by inserting an explicit row that wins.
    const { getDb } = require('../src/db/migrate.ts') as typeof import('../src/db/migrate.ts');
    const db = getDb();
    db.prepare(`DELETE FROM tool_policies WHERE run_id = ? AND role = 'Engineer' AND tool_name = 'repo.search'`)
      .run(RUN_ID);
    db.prepare(`
      INSERT INTO tool_policies (id, run_id, team_id, role, tool_name, allowed,
        max_calls_per_cycle, max_calls_per_run, require_evidence)
      VALUES (?, ?, '', 'Engineer', 'repo.search', 0, 4, 30, 1)
    `).run(`tp_deny_${Date.now()}`, RUN_ID);
    db.close();

    const decision = policy.check({ role: 'Engineer', toolName: 'repo.search' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('explicitly denied');
  });

  it('isAllowed mirrors check', () => {
    const policy = new ToolPolicy(RUN_ID);
    expect(policy.isAllowed({ role: 'Critic', toolName: 'sandbox.exec' })).toBe(false);
    expect(policy.isAllowed({ role: 'Critic', toolName: 'repo.search' })).toBe(true);
  });

  it('seedDefaults is idempotent', () => {
    const policy = new ToolPolicy(RUN_ID);
    policy.seedDefaults();
    policy.seedDefaults();
    const { getDb } = require('../src/db/migrate.ts') as typeof import('../src/db/migrate.ts');
    const db = getDb();
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM tool_policies WHERE run_id = ? AND role = 'Engineer' AND tool_name = 'sandbox.exec'`
    ).get(RUN_ID) as { n: number };
    db.close();
    expect(row.n).toBe(1);
  });
});
