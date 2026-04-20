#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const checkSchema = args.includes('--check-schema');

const MIGRATIONS = [
  'src/db/migrate.ts',
  'src/db/migrate-phase5.ts',
  'src/db/migrate-phase5_1.ts',
  'src/db/migrate-phase6.ts',
  'src/db/migrate-phase6_1.ts',
  'src/db/migrate-phase7.ts',
  'src/db/migrate-phase8.ts',
  'src/db/migrate-phase9.ts',
  'src/db/migrate-phase10.ts',
  'src/db/migrate-phase12.ts', // Phase 12 included
];

// Enterprise-tier tables that MUST exist for a healthy platform
const REQUIRED_TABLES = [
  'runs',
  'approvals',
  'action_ledger',
  'benchmark_cases',
  'portfolio_runs',
  'tenants',
  'learning_cycles',
  'improvement_proposals',
  'prompt_versions',
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
    const { getDb } = await import('../../src/db/migrate.js');
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
