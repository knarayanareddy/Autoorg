#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as dotenvLoad } from 'dotenv';
import { getDbPath } from '@/db/migrate.js';
import { applyLegacyPrivacyCleanup, planLegacyPrivacyCleanup } from '@/runtime/legacy-privacy.js';

dotenvLoad();
const apply = process.argv.slice(2).includes('--apply');
let db: Database | null = null;
try {
  const dbPath = getDbPath();
  if (existsSync(dbPath)) db = new Database(dbPath, { create: false, readonly: !apply });
  else console.warn('No database found at the configured path; database contents will not be cleaned.');
  const transcriptDir = path.join(process.env.AUTOORG_MEMORY_DIR ?? './memory', 'transcripts');
  const plan = planLegacyPrivacyCleanup(transcriptDir, db);
  console.log(`${apply ? 'Applying' : 'Dry run:'} ${plan.files.length} transcript file(s), ${plan.indexedCount} indexed entries and ${plan.configs.length} run configuration(s), ${plan.contextCount} cycle context(s), ${plan.executionCount} agent execution(s).`);
  if (apply) {
    applyLegacyPrivacyCleanup(plan, db);
    if (db) {
      const checkpoint = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number } | null;
      if (checkpoint?.busy) throw new Error('WAL checkpoint blocked; stop all processes and rerun');
      db.run('VACUUM');
      const finalCheckpoint = db.query('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number } | null;
      if (finalCheckpoint?.busy) throw new Error('Final WAL checkpoint blocked; stop all processes and rerun');
    }
    console.log('Cleanup complete. Existing backups, snapshots and storage blocks may still contain old data.');
  } else console.log('No data changed. Stop all processes and rerun with --apply after securing a backup.');
} catch (err) {
  console.error(`Cleanup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exitCode = 1;
} finally { db?.close(); }
