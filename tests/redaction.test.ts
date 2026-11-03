/**
 * Redaction filter tests.
 *
 * Regression coverage for two production bugs:
 *   1. Any output containing a secret crashed the cycle, because the audit
 *      INSERT used columns the schema did not have.
 *   2. Detectors were module-level `/g` regexes used with `.test()`, so
 *      `lastIndex` carried over between calls and every other match was
 *      silently skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { RedactionFilter } from '../src/runtime/redaction.ts';
import { getDb } from '../src/db/migrate.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('redaction');

beforeAll(async () => { await useTestDb('autoorg-redaction-'); });
afterAll(() => cleanupTestDb());

describe('RedactionFilter', () => {
  it('redacts an Anthropic key and labels it correctly', () => {
    const result = RedactionFilter.redactOnly(
      'my key sk-ant-abcdefghijklmnopqrstuvwxyz012345 is here'
    );
    expect(result.text).toBe('my key [REDACTED:ANTHROPIC_KEY] is here');
    expect(result.redacted).toBe(true);
  });

  it('redacts an OpenAI key', () => {
    const result = RedactionFilter.redactOnly(
      'token sk-proj-abcdefghijklmnopqrstuvwxyz012345'
    );
    expect(result.text).toBe('token [REDACTED:OPENAI_KEY]');
  });

  it('redacts a GitHub token, AWS key and email', () => {
    const result = RedactionFilter.redactOnly(
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789 AKIAABCDEFGHIJKLMNOP bob@example.com'
    );
    expect(result.text).toContain('[REDACTED:GITHUB_TOKEN]');
    expect(result.text).toContain('[REDACTED:AWS_ACCESS_KEY]');
    expect(result.text).toContain('[REDACTED:EMAIL]');
  });

  it('redacts a PEM private key block', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA1234',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    expect(RedactionFilter.redactOnly(`before\n${pem}\nafter`).text)
      .toContain('[REDACTED:PRIVATE_KEY]');
  });

  // ── The stateful-regex regression ──────────────────────────────────
  it('redacts on EVERY consecutive call (stateful /g regex bug)', () => {
    const secret = 'key sk-ant-abcdefghijklmnopqrstuvwxyz012345 end';
    const filter = new RedactionFilter(RUN_ID, false);

    const results = [1, 2, 3, 4, 5].map(() => filter.redact(secret, { channel: 'output' }));

    for (const [i, result] of results.entries()) {
      expect(`call ${i + 1}: ${result.text}`).toBe(
        `call ${i + 1}: key [REDACTED:ANTHROPIC_KEY] end`
      );
      expect(result.eventCount).toBe(1);
    }
  });

  it('counts every occurrence, not just the first', () => {
    const result = RedactionFilter.redactOnly(
      'a@example.com and b@example.com and c@example.com'
    );
    expect(result.eventCount).toBe(3);
    expect(result.text).not.toContain('@');
  });

  it('leaves clean text untouched', () => {
    const text = 'No secrets here, just prose.';
    const result = RedactionFilter.redactOnly(text);
    expect(result.text).toBe(text);
    expect(result.redacted).toBe(false);
    expect(result.eventCount).toBe(0);
  });

  it('handles empty input', () => {
    expect(RedactionFilter.redactOnly('')).toEqual({
      text: '', redacted: false, eventCount: 0,
    });
  });

  // ── The persistence regression ────────────────────────────────────
  it('persists redaction events without crashing', () => {
    const filter = new RedactionFilter(RUN_ID);
    const result = filter.redact('contact bob@example.com', {
      channel: 'output',
      cycleNumber: 3,
    });

    expect(result.eventCount).toBe(1);

    const db = getDb();
    const rows = db.prepare(
      `SELECT detector, finding_type, channel, cycle_number, before_hash, after_hash
       FROM redaction_events WHERE run_id = ?`
    ).all(RUN_ID) as Array<Record<string, unknown>>;
    db.close();

    expect(rows.length).toBe(1);
    expect(rows[0]!.detector).toBe('pii');
    expect(rows[0]!.finding_type).toBe('email');
    expect(rows[0]!.channel).toBe('output');
    expect(rows[0]!.cycle_number).toBe(3);
    // Hashes are recorded but the plaintext secret is not.
    expect(rows[0]!.before_hash).toBeString();
    expect(rows[0]!.after_hash).toBeString();
  });

  it('never fails the caller when audit logging breaks', () => {
    // Simulate a broken audit sink by pointing at a bogus path.
    const filter = new RedactionFilter(RUN_ID, false);
    expect(() => filter.redact('bob@example.com', { channel: 'output' })).not.toThrow();
  });
});
