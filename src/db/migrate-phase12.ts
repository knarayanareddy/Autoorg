import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️ Running Phase 12 migrations (Learning Organization)...\n'));
  const db = getDb();
  
  const schemaPath = path.join(process.cwd(), 'src/db/schema-phase12.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  db.exec(schema);
  db.close();
  
  console.log(chalk.bold.green('✅ Phase 12 migration complete.\n'));
}

migrate().catch(err => {
  console.error(chalk.red('❌ Migration failed:'), err);
  process.exit(1);
});
