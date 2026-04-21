#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const checkSchema = args.includes('--check-schema');

const MIGRATIONS = [
  'src/db/migrate.ts',
];

// Core tables that MUST exist for a healthy platform (Phase 0-15 consolidated)
const REQUIRED_TABLES = [
  'runs',
  'cycles',
  'agent_executions',
  'mailbox_messages',
  'facts',
  'contradictions',
  'kg_nodes',
  'kg_edges',
  'feature_flags',
  'llm_providers',
  'llm_models',
  'benchmark_suites',
  'benchmark_cases'
];

async function main() {
  console.log(chalk.cyan('\n⚙️ Orchestrating full migration sequence...\n'));

  for (const migration of MIGRATIONS) {
    if (!existsSync(migration)) {
      console.warn(chalk.yellow(`  ⚠️ Skipping missing migration: ${migration}`));
      continue;
    }
    console.log(chalk.gray(`  → Running ${migration}...`));
    const result = await $`bun run ${migration}`.nothrow();
    if (result.exitCode !== 0) {
      console.error(chalk.red(`  ❌ Migration failed: ${migration}`));
      process.exit(1);
    }
  }

  if (verify || checkSchema) {
    console.log(chalk.cyan('\n🔍 Verifying schema integrity...\n'));
    const { getDb } = await import('../../src/db/migrate.ts');
    const db = getDb();

    for (const table of REQUIRED_TABLES) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!row) {
        console.error(chalk.red(`  ❌ REQUIRED TABLE MISSING: ${table}`));
        db.close();
        process.exit(1);
      }
      console.log(chalk.green(`  ✓ Found table: ${table}`));
    }

    db.close();
    console.log(chalk.bold.green('\n✅ Schema integrity verified. High-availability ready.\n'));
  }

  console.log(chalk.bold.green('✅ All migrations complete.\n'));
}

main();
