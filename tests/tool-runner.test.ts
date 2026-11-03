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

describe('constitution lock tool enforcement', () => {
  it('blocks sandbox execution before starting a subprocess', async () => {
    await import('../src/tools/manifests/sandbox-exec.ts');
    const previous = process.env.FEATURE_CONSTITUTION_LOCK;
    process.env.FEATURE_CONSTITUTION_LOCK = '1';
    try {
      await expect(runner.run('sandbox.exec', { command: 'echo harmless' }, CTX)).rejects.toThrow(/constitution lock/i);
      expect(executionCount()).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.FEATURE_CONSTITUTION_LOCK;
      else process.env.FEATURE_CONSTITUTION_LOCK = previous;
    }
  });
});

describe('tool input privacy', () => {
  it('does not persist an unknown search query by default', async () => {
    await import('../src/tools/manifests/repo-search.ts');
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { default: path } = await import('node:path');
    const dir = mkdtempSync(path.join(tmpdir(), 'tool-input-'));
    const old = { ...process.env };
    const query = 'arbitrary-private-search-value-728391';
    writeFileSync(path.join(dir, 'fixture.txt'), query);
    process.env.FEATURE_POLICY_ENGINE = '0';
    process.env.FEATURE_TOOL_USE = '0';
    process.env.FEATURE_CONSTITUTION_LOCK = '1';
    delete process.env.AUTOORG_TRANSCRIPT_CONTENT;
    delete process.env.AUTOORG_REPO_SEARCH_CONTENT;
    try {
      const result = await runner.run('repo.search', { query }, { ...CTX, cwd: dir });
      const db = getDb();
      const row = db.query('SELECT input_json, output_summary FROM tool_executions WHERE id = ?').get(result.executionId);
      db.close();
      expect(JSON.stringify(row)).not.toContain(query);
      const { toolRegistry } = await import('../src/tools/registry.ts');
      const tool = toolRegistry.get('repo.search');
      const execute = tool.execute;
      try {
        tool.execute = async () => ({ summary: query, output: query, sources: [{ type: 'file_hit', title: query, excerpt: query }] });
        const second = await runner.run('repo.search', { query }, { ...CTX, cwd: dir });
        const db2 = getDb();
        const saved = db2.query('SELECT output_summary FROM tool_executions WHERE id = ?').get(second.executionId);
        db2.close();
        expect(JSON.stringify(saved)).not.toContain(query);
      } finally { tool.execute = execute; }

    } finally {
      for (const key of ['FEATURE_POLICY_ENGINE', 'FEATURE_TOOL_USE', 'FEATURE_CONSTITUTION_LOCK', 'AUTOORG_TRANSCRIPT_CONTENT', 'AUTOORG_REPO_SEARCH_CONTENT']) {
        if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('evidence privacy', () => {
  it('keeps tool evidence in memory for the agent but omits sensitive fields from storage by default', async () => {
    const { EvidencePack } = await import('../src/tools/evidence-pack.ts');
    const previous = process.env.AUTOORG_TRANSCRIPT_CONTENT;
    delete process.env.AUTOORG_TRANSCRIPT_CONTENT;
    try {
      const secret = 'unknown-evidence-sensitive-value';
      const pack = new EvidencePack(RUN_ID, 1, 'Engineer');
      pack.addFromToolResult('exec1', { summary: 'summary', output: null, sources: [{ type: 'web_page', uri: secret, title: secret, excerpt: secret }] });
      expect(pack.formatForPrompt()).toContain(secret);
      const id = pack.save();
      const db = getDb();
      const rows = db.query('SELECT source_uri, title, excerpt FROM evidence_items WHERE pack_id = ?').all(id);
      db.close();
      expect(JSON.stringify(rows)).not.toContain(secret);
    } finally { if (previous === undefined) delete process.env.AUTOORG_TRANSCRIPT_CONTENT; else process.env.AUTOORG_TRANSCRIPT_CONTENT = previous; }
  });
});

describe('tool audit hashes', () => {
  it('retains hashes without storing raw tool input or output', async () => {
    const { PolicyEngine } = await import('../src/runtime/policy-engine.ts');
    const { createHash } = await import('node:crypto');
    const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { default: path } = await import('node:path');
    const dir = mkdtempSync(path.join(tmpdir(), 'tool-ledger-'));
    const keys = ['FEATURE_POLICY_ENGINE', 'FEATURE_TOOL_USE', 'FEATURE_UNSAFE_ACTION_DETECTOR', 'FEATURE_CONSTITUTION_LOCK', 'AUTOORG_TRANSCRIPT_CONTENT', 'AUTOORG_REPO_SEARCH_CONTENT'];
    const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    const query = 'unusual-search-credential-48192';
    writeFileSync(path.join(dir, 'data.txt'), query);
    process.env.FEATURE_POLICY_ENGINE = '1';
    process.env.FEATURE_TOOL_USE = '0';
    process.env.FEATURE_UNSAFE_ACTION_DETECTOR = '0';
    process.env.FEATURE_CONSTITUTION_LOCK = '1';
    delete process.env.AUTOORG_TRANSCRIPT_CONTENT;
    delete process.env.AUTOORG_REPO_SEARCH_CONTENT;
    try {
      new PolicyEngine(RUN_ID).seedDefaults();
      const ctx = { ...CTX, cwd: dir };
      const res = await runner.run('repo.search', { query }, ctx);
      const db = getDb();
      const row = db.query('SELECT input_json, input_hash, output_json, output_hash FROM action_ledger WHERE id = ?').get(ctx.taskId) as { input_json: string; input_hash: string; output_json: string; output_hash: string };
      db.close();
      expect(row.input_json).not.toContain(query);
      expect(row.output_json).not.toContain(query);
      expect(row.input_hash).toBe(createHash('sha256').update(JSON.stringify({ query, limit: 15 })).digest('hex'));
      expect(row.output_hash).toBe(createHash('sha256').update(JSON.stringify(res.result)).digest('hex'));
    } finally {
      for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
