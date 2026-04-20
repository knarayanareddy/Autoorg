#!/usr/bin/env bun
/**
 * AutoOrg Database Migration
 * Run: bun run db:migrate
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const DB_PATH = process.env.DB_PATH ?? './autoorg.db';
const SCHEMA_PATH = path.join(import.meta.dir, 'schema.sql');

export function getDb(): Database {
  const db = new Database(DB_PATH);
  
  // Performance settings
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA cache_size = -64000'); // 64MB cache
  
  return db;
}

async function migrate() {
  console.log(chalk.cyan('\n🗄️  Running AutoOrg database migrations...\n'));
  
  const db = getDb();
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  
  // Execute all statements in the schema file
  db.exec(schema);
  
  // Seed default feature flags
  const seedFlags = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES (?, ?, ?)
  `);
  
  const flags: [string, boolean, string][] = [
    // Shipped features
    ['autoDream',           true,  'Memory consolidation every N cycles (KAIROS)'],
    ['graphRag',            false, 'Knowledge graph grounding (Phase 4)'],
    ['parallelWorkers',     true,  'Run worker agents in parallel'],
    ['gitAuditTrail',       true,  'Commit/revert every proposal to git'],
    ['memoryTiers',         true,  'Three-tier memory system (MEMORY.md → facts/ → transcripts/)'],
    ['constitutionLock',    true,  'Terminate agents that modify constitution.md'],
    ['maxCostGuard',        true,  'Hard stop when API budget exceeded'],
    ['resultsTsv',          true,  'Write results.tsv log every cycle'],
    
    // Experimental (off by default)
    ['ultraplan',           false, 'Spawn Opus for 30-min deep planning on plateau (ULTRAPLAN)'],
    ['coordinatorMode',     false, 'CEO spawns sub-coordinators for sub-domains'],
    ['agentInterviews',     false, 'Post-run: interrogate any agent interactively'],
    ['crossDomainSim',      false, 'Run two parallel orgs and compare outputs'],
    ['buddyMode',           false, 'Terminal companion that reacts to score changes (BUDDY)'],
    ['kairosDaemon',        false, 'Persistent background process that survives terminal close'],
    ['humanCheckpoint',     false, 'Pause every N cycles for human review'],
    ['webDashboard',        false, 'Enable Next.js god-eye web dashboard'],
    ['streamingOutput',     false, 'Stream agent output to terminal in real-time'],
    ['multiOrg',            false, 'Run multiple orgs simultaneously from one command'],
  ];
  
  const seedMany = db.transaction(() => {
    for (const [name, enabled, desc] of flags) {
      seedFlags.run(name, enabled ? 1 : 0, desc);
    }
  });
  seedMany();
  
  console.log(chalk.green(`  ✓ Schema applied to: ${DB_PATH}`));
  console.log(chalk.green(`  ✓ Seeded ${flags.length} feature flags`));
  
  // Verify tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
  `).all() as { name: string }[];
  
  console.log(chalk.cyan(`\n  Tables created (${tables.length}):`));
  for (const t of tables) {
    console.log(chalk.gray(`    · ${t.name}`));
  }
  
  db.close();
  console.log(chalk.bold.green('\n✅ Database ready.\n'));
}

migrate().catch(console.error);
