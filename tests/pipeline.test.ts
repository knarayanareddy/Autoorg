import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

describe('Pipeline (Phase 2)', () => {
  beforeAll(async () => { await useTestDb('autoorg-pipeline-'); });
  afterAll(() => cleanupTestDb());

  it('pipeline module exists and exports runCyclePipeline', async () => {
    const module = await import('../src/runtime/pipeline.js');
    expect(typeof module.runCyclePipeline).toBe('function');
  });

  it('CycleContextBuilder exports correct methods', async () => {
    const { CycleContextBuilder } = await import('../src/runtime/cycle-context-builder.js');
    const proto = CycleContextBuilder.prototype;
    expect(typeof proto.forCEOAssignment).toBe('function');
    expect(typeof proto.forEngineer).toBe('function');
    expect(typeof proto.forCritic).toBe('function');
    expect(typeof proto.forDevilsAdvocate).toBe('function');
    expect(typeof proto.forArchivist).toBe('function');
    expect(typeof proto.forCEOSynthesis).toBe('function');
    expect(typeof proto.forRatchetJudge).toBe('function');
  });

  it('storeCycleContext and loadCycleContext round-trip', async () => {
    const { storeCycleContext, loadCycleContext } = await import('../src/runtime/cycle-context-builder.js');
    const { getDb } = await import('../src/db/migrate.js');

    // `cycle_context` comes from the real migration — no local DDL here.
    const runId = testRunId('pipeline');
    const testCycleId = `test_cycle_${Date.now()}`;

    const db2 = getDb();
    db2.prepare('INSERT INTO runs (id, status, config_json, org_md_hash, org_md_path) VALUES (?, ?, ?, ?, ?)').run(runId, 'running', '{}', 'test_hash', 'org.md');
    db2.prepare('INSERT INTO cycles (id, run_id, cycle_number) VALUES (?, ?, ?)').run(testCycleId, runId, 1);
    db2.close();

    storeCycleContext(testCycleId, runId, 'Engineer', {
      systemPrompt: 'You are the Engineer',
      userMessage:  'Write section 1',
    }, 'Here is section 1...');

    const loaded = loadCycleContext(testCycleId, 'Engineer');
    expect(loaded).not.toBeNull();
    expect(loaded?.systemPrompt).toBe('You are the Engineer');
    expect(loaded?.response).toBe('Here is section 1...');
  });
});
