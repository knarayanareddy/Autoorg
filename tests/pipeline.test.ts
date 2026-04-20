import { describe, it, expect } from 'bun:test';

describe('Pipeline (Phase 2)', () => {
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

    // Ensure table exists
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS cycle_context (
        id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL,
        run_id TEXT NOT NULL, agent_role TEXT NOT NULL,
        system_prompt TEXT NOT NULL, user_message TEXT NOT NULL,
        response TEXT NOT NULL, created_at DATETIME DEFAULT (datetime('now')),
        UNIQUE(cycle_id, agent_role)
      )
    `);
    db.close();

    const testRunId = 'test_run_' + Date.now();
    const testCycleId = 'test_cycle_' + Date.now();

    const db2 = getDb();
    db2.prepare('INSERT INTO runs (id, status, config_json, org_md_hash, org_md_path) VALUES (?, ?, ?, ?, ?)').run(testRunId, 'running', '{}', 'test_hash', 'org.md');
    db2.prepare('INSERT INTO cycles (id, run_id, cycle_number) VALUES (?, ?, ?)').run(testCycleId, testRunId, 1);
    db2.close();

    storeCycleContext(testCycleId, testRunId, 'Engineer', {
      systemPrompt: 'You are the Engineer',
      userMessage:  'Write section 1',
    }, 'Here is section 1...');

    const loaded = loadCycleContext(testCycleId, 'Engineer');
    expect(loaded).not.toBeNull();
    expect(loaded?.systemPrompt).toBe('You are the Engineer');
    expect(loaded?.response).toBe('Here is section 1...');
  });
});
