#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const DB_PATH = process.env.DB_PATH ?? './autoorg.db';
const SCHEMA_PATH = path.join(import.meta.dir, 'schema-phase15.sql');

async function main() {
  console.log(chalk.cyan('\n🗄️  Applying Phase 15 migrations (Configurable Providers)...\n'));

  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  console.log(chalk.green(`  ✓ Phase 15 schema applied to: ${DB_PATH}`));
  
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE name IN ('llm_providers', 'llm_models')`).all();
  if (tables.length === 2) {
    console.log(chalk.green('  ✓ Tables llm_providers and llm_models verified.'));
  } else {
    console.error(chalk.red('  ✗ Migration failed: Tables missing.'));
    process.exit(1);
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Phase 15 migration ready.\n'));
}

main().catch(console.error);
