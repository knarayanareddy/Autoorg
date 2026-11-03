import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planLegacyPrivacyCleanup, applyLegacyPrivacyCleanup } from '../src/runtime/legacy-privacy';

describe('legacy privacy cleanup', () => {
  it('dry-runs, then removes transcript contents and indexed copies idempotently', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'legacy-privacy-'));
    const transcripts = path.join(dir, 'transcripts'); mkdirSync(transcripts);
    const file = path.join(transcripts, 'cycle_0001.jsonl');
    const secret = 'unknown-secret-abcdef';
    writeFileSync(file, JSON.stringify({ ts: '2026-01-01T00:00:00Z', run_id: 'run_abcd', cycle: 1, role: 'CEO', action: 'prompt', content: secret, metadata: { private: secret } }) + '\n');
    const db = new Database(':memory:');
    db.run('CREATE TABLE runs (id TEXT PRIMARY KEY, config_json TEXT NOT NULL)');
    db.run('CREATE TABLE transcript_index (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
    db.run('CREATE TABLE cycle_context (system_prompt TEXT, user_message TEXT, response TEXT)');
    db.run('CREATE TABLE agent_executions (system_prompt_hash TEXT, output_text TEXT)');
    db.run('CREATE TABLE tool_executions (input_json TEXT, output_json TEXT, output_summary TEXT, error_text TEXT)');
    db.run('CREATE TABLE tool_artifacts (source_uri TEXT, title TEXT, excerpt TEXT, metadata_json TEXT)');
    db.run('CREATE TABLE evidence_items (source_uri TEXT, title TEXT, excerpt TEXT)');
    db.run('CREATE TABLE action_ledger (target_kind TEXT, input_json TEXT, output_json TEXT, compensation_action_json TEXT, policy_snapshot_json TEXT)');
    db.query('INSERT INTO tool_executions VALUES (?, ?, ?, ?)').run(secret, secret, secret, secret);
    db.query('INSERT INTO tool_artifacts VALUES (?, ?, ?, ?)').run(secret, secret, secret, secret);
    db.query('INSERT INTO evidence_items VALUES (?, ?, ?)').run(secret, secret, secret);
    db.query('INSERT INTO action_ledger VALUES (?, ?, ?, ?, ?)').run('tool', secret, secret, secret, secret);
    db.query('INSERT INTO cycle_context VALUES (?, ?, ?)').run(secret, secret, secret);
    db.query('INSERT INTO agent_executions VALUES (?, ?)').run(Buffer.from(secret).toString('base64'), secret);
    db.run("CREATE VIRTUAL TABLE transcript_fts USING fts5(content, content='transcript_index', content_rowid='rowid')");
    db.query('INSERT INTO transcript_index VALUES (?, ?)').run('1', secret);
    db.query('INSERT INTO runs VALUES (?, ?)').run('run_abcd', JSON.stringify({ modelAssignments: { CEO: { apiKey: secret, model: 'm' } } }));
    try {
      const plan = planLegacyPrivacyCleanup(transcripts, db);
      expect(readFileSync(file, 'utf8')).toContain(secret);
      expect((db.query('SELECT count(*) AS n FROM transcript_index').get() as any).n).toBe(1);
      applyLegacyPrivacyCleanup(plan, db);
      expect(readFileSync(file, 'utf8')).not.toContain(secret);
      expect(JSON.parse(readFileSync(file, 'utf8')).content).toBe('[CONTENT OMITTED]');
      expect((db.query('SELECT count(*) AS n FROM transcript_index').get() as any).n).toBe(0);
      expect(JSON.stringify(db.query('SELECT config_json FROM runs').get())).not.toContain(secret);
      for (const table of ['tool_executions', 'tool_artifacts', 'evidence_items', 'action_ledger']) {
        expect(JSON.stringify(db.query(`SELECT * FROM ${table}`).get())).not.toContain(secret);
      }
      expect(JSON.stringify(db.query('SELECT * FROM cycle_context').get())).not.toContain(secret);
      expect(JSON.stringify(db.query('SELECT * FROM agent_executions').get())).not.toContain(secret);
      expect(JSON.stringify(db.query('SELECT * FROM agent_executions').get())).not.toContain(Buffer.from(secret).toString('base64'));
      const sanitized = readFileSync(file, 'utf8');
      applyLegacyPrivacyCleanup(planLegacyPrivacyCleanup(transcripts, db), db);
      expect(readFileSync(file, 'utf8')).toBe(sanitized);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses malformed files and symlinks without changing the original', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'legacy-privacy-'));
    try {
      const f = path.join(dir, 'cycle_0001.jsonl'); writeFileSync(f, '{bad json');
      expect(() => planLegacyPrivacyCleanup(dir, null)).toThrow();
      expect(readFileSync(f, 'utf8')).toBe('{bad json');
      rmSync(f); symlinkSync('/etc/passwd', f);
      expect(() => planLegacyPrivacyCleanup(dir, null)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('offline privacy cleanup command', () => {
  it('leaves data untouched in dry-run and cleans a real migrated database on apply', async () => {
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(path.join(tmpdir(), 'legacy-cli-'));
    const transcripts = path.join(dir, 'transcripts'); mkdirSync(transcripts);
    const file = path.join(transcripts, 'cycle_0001.jsonl');
    const dbPath = path.join(dir, 'test.db');
    const secret = 'unusual-secret-fixture-not-pattern-shaped';
    const env = { ...process.env, AUTOORG_MEMORY_DIR: dir, AUTOORG_DB_PATH: dbPath };
    const run = (args: string[]) => spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    try {
      expect(run(['run', 'db:migrate']).status).toBe(0);
      writeFileSync(file, JSON.stringify({ role: 'CEO', cycle: 1, action: 'prompt', content: secret }) + '\n');
      const db = new Database(dbPath);
      db.query('INSERT INTO runs (id, org_md_hash, config_json) VALUES (?, ?, ?)').run('run_1', 'x', JSON.stringify({ modelAssignments: { CEO: { apiKey: secret } } }));
      db.query('INSERT INTO transcript_index (id, run_id, cycle_number, role, action, content, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run('t1', 'run_1', 1, 'CEO', 'prompt', secret, 'h');
      db.run("INSERT INTO transcript_fts(transcript_fts) VALUES ('rebuild')");
      db.close();
      expect(run(['run', 'src/scripts/sanitize-legacy-privacy.ts']).status).toBe(0);
      expect(readFileSync(file, 'utf8')).toContain(secret);
      expect(run(['run', 'src/scripts/sanitize-legacy-privacy.ts', '--apply']).status).toBe(0);
      expect(readFileSync(file, 'utf8')).not.toContain(secret);
      expect(readFileSync(dbPath).includes(Buffer.from(secret))).toBe(false);
      const verify = new Database(dbPath);
      expect((verify.query('SELECT count(*) AS n FROM transcript_index').get() as { n: number }).n).toBe(0);
      expect(JSON.stringify(verify.query('SELECT config_json FROM runs').get())).not.toContain(secret);
      verify.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
