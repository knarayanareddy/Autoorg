import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getDb } from '../src/db/migrate';
import { getRun, getAllRuns, getLatestRun } from '../src/db/queries';
import { cleanupTestDb, useTestDb } from './helpers/test-db';
const id = 'run_privacy_test';
const secret = 'legacy-provider-value-do-not-expose';
beforeAll(async () => {
  await useTestDb('run-config-privacy-');
  const db = getDb();
  db.query('INSERT INTO runs (id, org_md_hash, config_json) VALUES (?, ?, ?)').run(id, 'x', JSON.stringify({ modelAssignments: { CEO: { apiKey: secret } } }));
  db.close();
});
afterAll(() => cleanupTestDb());
describe('legacy run config reads', () => {
  it('never returns embedded legacy credentials through run queries', () => {
    expect(JSON.stringify(getRun(id))).not.toContain(secret);
    expect(JSON.stringify(getAllRuns())).not.toContain(secret);
    expect(JSON.stringify(getLatestRun())).not.toContain(secret);
  });
});
