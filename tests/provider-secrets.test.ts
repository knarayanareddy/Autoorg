import { afterEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { encryptProviderKey, decryptProviderKey, migrateProviderKeys } from '../src/config/provider-secrets';
const oldKey = process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY;
afterEach(() => { if (oldKey === undefined) delete process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY; else process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = oldKey; });

describe('provider key encryption', () => {
  it('encrypts randomly and authenticates both content and provider identity', () => {
    process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = '01'.repeat(32);
    const encrypt = encryptProviderKey;
    const decrypt = decryptProviderKey;
    const first = encrypt('credential-value', 'p1');
    expect(first).not.toContain('credential-value');
    expect(encrypt('credential-value', 'p1')).not.toBe(first);
    expect(decrypt(first, 'p1')).toBe('credential-value');
    expect(() => decrypt(first, 'p2')).toThrow();
    expect(() => decrypt(first.slice(0, -1) + '!', 'p1')).toThrow();
    process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = '02'.repeat(32);
    expect(() => decrypt(first, 'p1')).toThrow();
  });
  it('refuses plaintext, missing keys and invalid keys', () => {
    delete process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY;
    expect(() => encryptProviderKey('secret', 'p1')).toThrow();
    expect(() => decryptProviderKey('legacy-secret', 'p1')).toThrow();
    process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = 'weak';
    expect(() => encryptProviderKey('secret', 'p1')).toThrow();
  });
  it('migrates plaintext transactionally and validates existing ciphertext', () => {
    process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = '01'.repeat(32);
    const db = new Database(':memory:');
    db.run('CREATE TABLE llm_providers (id TEXT PRIMARY KEY, api_key TEXT)');
    db.query('INSERT INTO llm_providers VALUES (?, ?)').run('p1', 'old-credential');
    db.query('INSERT INTO llm_providers VALUES (?, ?)').run('p2', 'another-credential');
    expect(migrateProviderKeys(db)).toBe(2);
    const rows = db.query('SELECT * FROM llm_providers ORDER BY id').all() as Array<{id:string;api_key:string}>;
    expect(rows[0]!.api_key).not.toContain('old-credential');
    expect(decryptProviderKey(rows[0]!.api_key, 'p1')).toBe('old-credential');
    expect(migrateProviderKeys(db)).toBe(0);
    process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = '02'.repeat(32);
    db.query('INSERT INTO llm_providers VALUES (?, ?)').run('p3', 'not-yet-migrated');
    expect(() => migrateProviderKeys(db)).toThrow();
    expect((db.query('SELECT api_key FROM llm_providers WHERE id = ?').get('p3') as any).api_key).toBe('not-yet-migrated');
    db.close();
  });
});

describe('provider key integration', () => {
  it('seeds without plaintext and migrates legacy rows offline', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { default: path } = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(path.join(tmpdir(), 'provider-secrets-'));
    const dbPath = path.join(dir, 'data.db');
    const env = { ...process.env, AUTOORG_DB_PATH: dbPath, ANTHROPIC_API_KEY: 'local-fixture-provider-value' };
    delete env.AUTOORG_PROVIDER_ENCRYPTION_KEY;
    const run = (script: string, e = env) => spawnSync(process.execPath, ['run', script], { env: e, encoding: 'utf8' });
    try {
      expect(run('db:migrate').status).toBe(0);
      expect(run('src/scripts/seed-providers.ts').status).toBe(0);
      const db = new Database(dbPath);
      const keys = db.query('SELECT api_key FROM llm_providers WHERE api_key IS NOT NULL').all();
      expect(keys).toHaveLength(0);
      db.run("UPDATE llm_providers SET is_enabled = 0 WHERE provider_type = 'anthropic'");
      db.query('INSERT INTO llm_providers (id, name, provider_type, api_key, is_default) VALUES (?, ?, ?, ?, 1)').run('legacy', 'legacy', 'anthropic', 'legacy-provider-fixture');
      db.close();
      const useAdapter = (e: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['-e', "import { getAdapter } from './src/adapters/adapter-factory.ts'; getAdapter({provider:'anthropic'});"], { env: e, encoding: 'utf8' });
      expect(useAdapter(env).status).not.toBe(0);
      expect(run('src/scripts/encrypt-provider-keys.ts').status).not.toBe(0);
      const migrated = run('src/scripts/encrypt-provider-keys.ts', { ...env, AUTOORG_PROVIDER_ENCRYPTION_KEY: '01'.repeat(32) });
      expect(migrated.status).toBe(0);
      expect(useAdapter(env).status).not.toBe(0);
      expect(useAdapter({ ...env, AUTOORG_PROVIDER_ENCRYPTION_KEY: '02'.repeat(32) }).status).not.toBe(0);
      expect(useAdapter({ ...env, AUTOORG_PROVIDER_ENCRYPTION_KEY: '01'.repeat(32) }).status).toBe(0);
      expect(readFileSync(dbPath).includes(Buffer.from('legacy-provider-fixture'))).toBe(false);
      const verify = new Database(dbPath);
      const row = verify.query('SELECT api_key FROM llm_providers WHERE id = ?').get('legacy') as { api_key: string };
      process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY = '01'.repeat(32);
      expect(decryptProviderKey(row.api_key, 'legacy')).toBe('legacy-provider-fixture');
      verify.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
