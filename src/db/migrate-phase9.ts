#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from './migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️  Running Phase 9 Strategic Pivoting migrations...\n'));

  const db = getDb();
  const schemaPath = path.join(import.meta.dir, 'schema-phase9.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  db.exec(schema);
  db.close();

  console.log(chalk.bold.green('✅ Phase 9 migration complete.\n'));
}

migrate().catch(console.error);
