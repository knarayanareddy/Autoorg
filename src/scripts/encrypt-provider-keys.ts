#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { config as dotenvLoad } from 'dotenv';
import { getDbPath } from '@/db/migrate.js';
import { migrateProviderKeys } from '@/config/provider-secrets.js';

dotenvLoad();
try {
  // Do not create a database accidentally. Run offline after making a backup.
  const db = new Database(getDbPath(), { readonly: false, create: false });
  try {
    const count = migrateProviderKeys(db);
    const checkpoint = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number } | null;
    if (checkpoint?.busy) throw new Error('WAL checkpoint was blocked; stop all processes and rerun the migration');
    db.run('VACUUM');
    console.log(`Encrypted ${count} provider key(s). Checkpoint and vacuum completed.`);
  } finally { db.close(); }
} catch (err) {
  console.error(`Provider key migration failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exitCode = 1;
}
