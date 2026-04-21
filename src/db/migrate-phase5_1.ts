#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from './migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️ Running Phase 5.1 Hardening migrations...\n'));
  
  const db = getDb();
  const schemaPath = path.join(import.meta.dir, 'schema-phase5_1.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  try {
    db.exec(schema);
    console.log(chalk.bold.green('✅ Phase 5.1 migration complete.\n'));
  } catch (err) {
    console.error(chalk.red('✗ Migration failed:'), err);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
