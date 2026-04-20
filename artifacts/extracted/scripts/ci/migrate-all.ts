TypeScript

#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const checkSchema = args.includes('--check-schema');
const remote = args.includes('--remote');

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
];

const REQUIRED_TABLES = [
  'runs',
  'approvals',
  'pending_actions',
  'tool_executions',
  'action_ledger',
  'benchmark_cases',
  'portfolio_runs',
  'tenants',
  'learning_cycles',
];

async function main() {
  console.log(chalk.cyan('\n⚙️ Running all migrations...\n'));

  for (const migration of MIGRATIONS) {
    if (!existsSync(migration)) {
      console.warn(chalk.yellow(`Skipping missing migration: ${migration}`));
      continue;
    }
    const result = await $`bun run ${migration}`.nothrow();
    if (result.exitCode !== 0) {
      console.error(chalk.red(`Migration failed: ${migration}`));
      process.exit(1);
    }
  }

  if (verify || checkSchema) {
    const { getDb } = await import('../../src/db/migrate.js');
    const db = getDb();

    for (const table of REQUIRED_TABLES) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      if (!row) {
        console.error(chalk.red(`Required table missing: ${table}`));
        db.close();
        process.exit(1);
      }
    }

    db.close();
    console.log(chalk.green('✅ Schema integrity verified'));
  }

  console.log(chalk.green('✅ All migrations complete'));
}

main();