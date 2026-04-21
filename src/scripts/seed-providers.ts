#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import chalk from 'chalk';

const DB_PATH = process.env.DB_PATH ?? './autoorg.db';

async function main() {
  console.log(chalk.cyan('\n🌱 Seeding Dynamic LLM Providers from Environment...\n'));

  const db = new Database(DB_PATH);
  db.run('PRAGMA foreign_keys = ON');

  const providers = [
    {
      name: 'Primary Anthropic',
      type: 'anthropic',
      key: process.env.AUTOORG_API_KEY_ANTHROPIC,
      baseUrl: null,
      enabled: process.env.AUTOORG_API_KEY_ANTHROPIC ? 1 : 0
    },
    {
      name: 'Primary OpenAI',
      type: 'openai',
      key: process.env.OPENAI_API_KEY,
      baseUrl: null,
      enabled: process.env.OPENAI_API_KEY ? 1 : 0
    },
    {
      name: 'Local Ollama',
      type: 'ollama',
      key: 'null',
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      enabled: 1
    },
    {
      name: 'Groq Cloud',
      type: 'groq',
      key: process.env.GROQ_API_KEY,
      baseUrl: null,
      enabled: process.env.GROQ_API_KEY ? 1 : 0
    }
  ];

  for (const p of providers) {
    const id = `prov_${nanoid(8)}`;
    db.prepare(`
      INSERT OR IGNORE INTO llm_providers (id, name, provider_type, api_key, base_url, is_enabled, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, p.name, p.type, p.key ?? null, p.baseUrl, p.enabled, p.type === 'anthropic' ? 1 : 0);
    
    console.log(chalk.green(`  ✓ Seeded provider: ${p.name} (${p.type})`));
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Provider seeding complete.\n'));
}

main().catch(console.error);
