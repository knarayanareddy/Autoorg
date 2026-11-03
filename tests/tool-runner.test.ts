/**
 * Tool input validation tests — OWASP A03/A04 (no `safeParse` in tool-runner).
 *
 * `ToolRunner.run` executed `tool.execute(input)` with whatever the LLM
 * produced — no schema check. Malformed tool input now fails BEFORE any
 * policy evaluation, ledger entry, execution row or side effect.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ToolRunner } from '../src/tools/tool-runner.ts';
import { getDb } from '../src/db/migrate.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('toolrunner');

let runner: ToolRunner;

beforeAll(async () => {
  await useTestDb('autoorg-toolrunner-');
  // Registers `web.fetch` against the TEST database (register() writes
  // tool_definitions at module load, so the import must be dynamic).
  await import('../src/tools/manifests/web-fetch.ts');
  runner = new ToolRunner(RUN_ID);
});

afterAll(() => cleanupTestDb());

const CTX = { runId: RUN_ID, cycleNumber: 1, role: 'Engineer' as const };

function executionCount(): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM tool_executions WHERE run_id = ?`
  ).get(RUN_ID) as { n: number };
  db.close();
  return row.n;
}

describe('ToolRunner input validation (safeParse)', () => {
  it('rejects input with the wrong value types before execution', async () => {
    await expect(
      runner.run('web.fetch', { url: 12345, maxChars: 'nope' }, CTX)
    ).rejects.toThrow(/Invalid tool input/i);
    expect(executionCount()).toBe(0);
  });

  it('rejects input missing required fields', async () => {
    await expect(
      runner.run('web.fetch', {}, CTX)
    ).rejects.toThrow(/Invalid tool input/i);
    expect(executionCount()).toBe(0);
  });

  it('names the tool and the offending field', async () => {
    let message = '';
    try {
      await runner.run('web.fetch', { maxChars: 100 }, CTX);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('web.fetch');
    expect(message).toContain('url');
    expect(executionCount()).toBe(0);
  });
});
