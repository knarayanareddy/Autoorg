#!/usr/bin/env bun
/**
 * AutoOrg Phase 2 Migration
 * Run: bun run src/db/migrate-phase2.ts
 */

import { readFileSync } from 'node:fs';
import path             from 'node:path';
import chalk            from 'chalk';
import { getDb }        from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n🗄️  Running Phase 2 migrations...\n'));

  const db     = getDb();
  const schema = readFileSync(
    path.join(import.meta.dir, 'schema-phase2.sql'),
    'utf-8'
  );

  db.exec(schema);

  // Seed Phase 2 feature flags
  const seedFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES (?, ?, ?)
  `);

  const phase2Flags: [string, boolean, string][] = [
    ['persistentObjections',  true,  'Track Critic objections across cycles (Phase 2)'],
    ['sequentialPipeline',    true,  'Engineer→Critic→Advocate sequential pipeline (Phase 2)'],
    ['cycleContextStorage',   true,  'Store full agent context for post-run interviews (Phase 2)'],
    ['agentInterviews',       true,  'Post-run agent interview mode (Phase 2)'],
    ['webDashboard',          true,  'Next.js god-eye web dashboard (Phase 2)'],
    ['websocketEvents',       true,  'Broadcast live events to dashboard via WebSocket (Phase 2)'],
    ['pipelineTracking',      true,  'Track each pipeline step in DB (Phase 2)'],
    ['objectionLifecycle',    true,  'Full raise→track→resolve→archive objection lifecycle (Phase 2)'],
  ];

  const seedMany = db.transaction(() => {
    for (const [name, enabled, desc] of phase2Flags) {
      seedFlag.run(name, enabled ? 1 : 0, desc);
    }
  });
  seedMany();

  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all() as { name: string }[];

  console.log(chalk.green(`  ✓ Phase 2 schema applied`));
  console.log(chalk.green(`  ✓ Total tables: ${tables.length}`));
  console.log(chalk.green(`  ✓ Phase 2 feature flags seeded`));

  // Print new tables
  const phase2Tables = ['objections','pipeline_steps','cycle_context','interview_sessions','websocket_events'];
  for (const t of phase2Tables) {
    if (tables.some(r => r.name === t)) {
      console.log(chalk.gray(`    + ${t}`));
    }
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Phase 2 migration complete.\n'));
}

migrate().catch(console.error);
