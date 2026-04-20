TypeScript

#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️ Running Phase 8 migrations...\n'));
  const db = getDb();
  const schema = readFileSync(path.join(import.meta.dir, 'schema-phase8.sql'), 'utf-8');
  db.exec(schema);
  db.close();
  console.log(chalk.bold.green('✅ Phase 8 migration complete.\n'));
}

migrate().catch(console.error);
Run:

Bash

bun run src/db/migrate-phase8.ts
2. Variant manifest format
Each portfolio variant is a fully named org strategy.

Example portfolio/variants/default.json
JSON

{
  "variant_key": "default",
  "display_name": "Baseline Default",
  "constitution_variant": "default",
  "template_variant": "baseline",
  "role_mix": {
    "ceo": 1,
    "engineer": 1,
    "critic": 1,
    "archivist": 1
  },
  "model_map": {
    "ceo": "claude-opus-4",
    "engineer": "claude-sonnet-4-5",
    "critic": "claude-sonnet-4-5",
    "archivist": "gpt-4.1"
  }
}
Example portfolio/variants/strict_grounding.json
JSON

{
  "variant_key": "strict_grounding",
  "display_name": "Strict Grounding",
  "constitution_variant": "strict_grounding",
  "template_variant": "quality_heavy",
  "role_mix": {
    "ceo": 1,
    "engineer": 1,
    "critic": 2,
    "archivist": 1,
    "devils_advocate": 1
  },
  "model_map": {
    "ceo": "claude-opus-4",
    "engineer": "claude-sonnet-4-5",
    "critic": "claude-sonnet-4-5",
    "archivist": "gpt-4.1",
    "devils_advocate": "gpt-4.1"
  }
}