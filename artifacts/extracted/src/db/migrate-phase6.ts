TypeScript

#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️ Running Phase 6 migrations...\n'));
  const db = getDb();
  const schema = readFileSync(path.join(import.meta.dir, 'schema-phase6.sql'), 'utf-8');
  db.exec(schema);
  db.close();
  console.log(chalk.bold.green('✅ Phase 6 migration complete.\n'));
}

migrate().catch(console.error);
Run:

Bash

bun run src/db/migrate-phase6.ts
2. Tool manifest model