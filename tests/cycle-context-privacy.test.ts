import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { useTestDb, cleanupTestDb } from './helpers/test-db';
import { getDb } from '../src/db/migrate';
import { getAgentExecutionsForCycle } from '../src/db/queries';
import { loadCycleContext, storeCycleContext } from '../src/runtime/cycle-context-builder';
const secret = 'unusual-unknown-prompt-credential';
let previous: string | undefined;
beforeAll(async () => {
  await useTestDb('context-privacy-');
  previous = process.env.AUTOORG_TRANSCRIPT_CONTENT;
  delete process.env.AUTOORG_TRANSCRIPT_CONTENT;
  const db = getDb();
  db.query('INSERT INTO runs (id, org_md_hash) VALUES (?, ?)').run('r1', 'x');
  db.query('INSERT INTO cycles (id, run_id, cycle_number) VALUES (?, ?, ?)').run('c1', 'r1', 1);
  db.close();
});
afterAll(() => {
  if (previous === undefined) delete process.env.AUTOORG_TRANSCRIPT_CONTENT; else process.env.AUTOORG_TRANSCRIPT_CONTENT = previous;
  cleanupTestDb();
});
describe('cycle context privacy', () => {
  it('does not persist arbitrary prompt and response content by default', () => {
    storeCycleContext('c1', 'r1', 'CEO', { systemPrompt: secret, userMessage: secret }, secret);
    const db = getDb();
    const row = db.query('SELECT system_prompt, user_message, response FROM cycle_context WHERE cycle_id = ?').get('c1');
    db.close();
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(loadCycleContext('c1', 'CEO'))).not.toContain(secret);
  });
  it('masks legacy outputs and reversible fake hashes in API queries', () => {
    const db = getDb();
    db.query('INSERT INTO agent_executions (id, cycle_id, run_id, agent_role, phase, provider, model, output_text, system_prompt_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'c1', 'r1', 'CEO', 1, 'openai', 'm', secret, Buffer.from(secret).toString('base64'));
    db.close();
    const rows = getAgentExecutionsForCycle('c1');
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(JSON.stringify(rows)).not.toContain(Buffer.from(secret).toString('base64'));
  });
  it('does not return legacy context when content collection is disabled', () => {
    const db = getDb();
    db.query('UPDATE cycle_context SET response = ? WHERE cycle_id = ?').run(secret, 'c1');
    db.close();
    expect(JSON.stringify(loadCycleContext('c1', 'CEO'))).not.toContain(secret);
  });
});
