import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Database } from 'bun:sqlite';

const PREFIX = 'enc:v1:';
function encryptionKey(): Buffer {
  const raw = process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('AUTOORG_PROVIDER_ENCRYPTION_KEY must be a 64-character hex-encoded random key');
  return Buffer.from(raw, 'hex');
}

/** AES-256-GCM with a random nonce and provider identity as associated data. */
export function encryptProviderKey(value: string, providerId: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(providerId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${nonce.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptProviderKey(value: string, providerId: string): string {
  if (!value.startsWith(PREFIX)) throw new Error('Legacy plaintext provider key: run provider key migration before starting');
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3 || !/^[0-9a-f]{24}$/i.test(parts[0]!) || !/^[0-9a-f]{32}$/i.test(parts[1]!) || !/^(?:[0-9a-f]{2})+$/i.test(parts[2]!)) {
    throw new Error('Invalid encrypted provider key');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(parts[0]!, 'hex'));
    decipher.setAAD(Buffer.from(providerId, 'utf8'));
    decipher.setAuthTag(Buffer.from(parts[1]!, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2]!, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Cannot decrypt provider key: check encryption key and database integrity');
  }
}

/** Run with the application stopped. Caller handles checkpointing/vacuum. */
export function migrateProviderKeys(db: Database): number {
  encryptionKey(); // validate even if the database contains no keys
  db.run('PRAGMA secure_delete = ON');
  return db.transaction(() => {
    const rows = db.query('SELECT id, api_key FROM llm_providers WHERE api_key IS NOT NULL AND api_key != ?').all('') as Array<{ id: string; api_key: string }>;
    // Validate all existing ciphertext before writing anything; a wrong key must
    // not produce a database encrypted under a mixture of keys.
    for (const row of rows) if (row.api_key.startsWith(PREFIX)) decryptProviderKey(row.api_key, row.id);
    let count = 0;
    const update = db.query('UPDATE llm_providers SET api_key = ? WHERE id = ?');
    for (const row of rows) {
      if (!row.api_key.startsWith(PREFIX)) {
        update.run(encryptProviderKey(row.api_key, row.id), row.id);
        count++;
      }
    }
    return count;
  }).immediate();
}
