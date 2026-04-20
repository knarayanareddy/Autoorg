#!/usr/bin/env bun
/**
 * AutoOrg Phase 3 Migration
 * Run: bun run src/db/migrate-phase3.ts
 */

import { readFileSync } from 'node:fs';
import path             from 'node:path';
import chalk            from 'chalk';
import { getDb }        from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n🗄️  Running Phase 3 migrations...\n'));

  const db     = getDb();
  const schema = readFileSync(
    path.join(import.meta.dir, 'schema-phase3.sql'),
    'utf-8'
  );

  db.exec(schema);

  // Seed Phase 3 feature flags
  const seedFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES (?, ?, ?)
  `);

  const phase3Flags: [string, boolean, string][] = [
    ['fullAutoDream',          true,  'Full autoDream engine with LLM consolidation (Phase 3)'],
    ['semanticSearch',         true,  'Semantic search across tier-3 transcripts (Phase 3)'],
    ['localEmbeddings',        true,  'Local embeddings — zero API cost (Phase 3)'],
    ['hybridSearch',           true,  '0.7 vector + 0.3 BM25 hybrid search (Phase 3)'],
    ['factStore',              true,  'Structured fact store with confidence scores (Phase 3)'],
    ['contradictionDetection', true,  'Automatic contradiction detection between facts (Phase 3)'],
    ['antiPatternDetector',    true,  'Flags recurring failure modes across cycles (Phase 3)'],
    ['dreamOnPlateau',         true,  'Trigger extra dream when score plateaus (Phase 3)'],
    ['memoryHealthMonitor',    true,  'Monitor memory staleness and bloat (Phase 3)'],
    ['autonomousMemoryRewrite',true,  'Archivist can rewrite MEMORY.md autonomously (Phase 3)'],
    ['transcriptIndex',        true,  'FTS5 index over tier-3 transcripts for fast search (Phase 3)'],
    ['dreamReport',            true,  'Generate human-readable dream consolidation report (Phase 3)'],
  ];

  const seedMany = db.transaction(() => {
    for (const [name, enabled, desc] of phase3Flags) {
      seedFlag.run(name, enabled ? 1 : 0, desc);
    }
  });
  seedMany();

  // Print new tables
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all() as { name: string }[];

  const phase3Tables = [
    'facts', 'dream_runs', 'embeddings_cache',
    'transcript_index', 'transcript_fts',
    'contradictions', 'memory_snapshots_v2',
  ];

  console.log(chalk.green(`  ✓ Phase 3 schema applied`));
  console.log(chalk.green(`  ✓ Total tables: ${tables.length}`));
  console.log(chalk.cyan('\n  New Phase 3 tables:'));
  for (const t of phase3Tables) {
    const exists = tables.some(r => r.name === t);
    console.log(exists
      ? chalk.green(`    + ${t}`)
      : chalk.red(`    ✗ ${t} (missing!)`)
    );
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Phase 3 migration complete.\n'));
}

migrate().catch(console.error);
