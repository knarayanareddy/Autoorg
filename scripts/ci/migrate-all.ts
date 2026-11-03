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

// Core tables that MUST exist for a healthy platform (Phase 0-15 consolidated).
// Includes the hardening/governance tables the orchestrator touches on its very
// first cycle — those were missing from the schema entirely, so this check used
// to pass on a database that could not run a cycle.
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
  'benchmark_cases',
  // Hardening / governance (Phase 5)
  'objections',
  'approvals',
  'pending_actions',
  'action_ledger',
  'action_policies',
  'tool_policies',
  'tool_executions',
  'redaction_events',
  'security_findings',
  'workspace_locks',
  'run_checkpoints',
  // Migration bookkeeping
  'schema_migrations',
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
    // Note: relative to THIS file's directory (scripts/ci/), so ../../src is correct.
    const { getDb, getSchemaVersion } = await import('../../src/db/migrate.ts');
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

    const version = getSchemaVersion(db);
    db.close();
    console.log(chalk.gray(`\n  Schema version: ${version}`));
    console.log(chalk.bold.green('\n✅ Schema integrity verified. High-availability ready.\n'));
  }

  console.log(chalk.bold.green('✅ All migrations complete.\n'));
}

main();
