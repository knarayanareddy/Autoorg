#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { nanoid } from 'nanoid';
import chalk from 'chalk';
import { getDbPath } from '@/db/migrate.js';
import { providerApiKey, providerBaseUrl } from '@/config/env.js';
import { encryptProviderKey } from '@/config/provider-secrets.js';

const DB_PATH = getDbPath();

async function main() {
  console.log(chalk.cyan('\n🌱 Seeding Dynamic LLM Providers from Environment...\n'));

  const db = new Database(DB_PATH);
  db.run('PRAGMA foreign_keys = ON');

  // Uses the same resolvers as the adapters, so the documented env var names
  // (ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY) work here too.
  const anthropicKey = providerApiKey('anthropic');
  const openaiKey    = providerApiKey('openai');
  const groqKey      = providerApiKey('groq');
  const togetherKey  = providerApiKey('together');
  const geminiKey    = providerApiKey('gemini');

  const providers = [
    {
      name: 'Primary Anthropic',
      type: 'anthropic',
      key: anthropicKey || null,
      baseUrl: providerBaseUrl('anthropic') || null,
      enabled: anthropicKey ? 1 : 0
    },
    {
      name: 'Primary OpenAI',
      type: 'openai',
      key: openaiKey || null,
      baseUrl: providerBaseUrl('openai') || null,
      enabled: openaiKey ? 1 : 0
    },
    {
      name: 'Google Gemini',
      type: 'gemini',
      key: geminiKey || null,
      baseUrl: null,
      enabled: geminiKey ? 1 : 0
    },
    {
      name: 'Local Ollama',
      type: 'ollama',
      key: null,
      baseUrl: providerBaseUrl('ollama') || 'http://localhost:11434',
      enabled: 1
    },
    {
      name: 'Groq Cloud',
      type: 'groq',
      key: groqKey || null,
      baseUrl: providerBaseUrl('groq') || null,
      enabled: groqKey ? 1 : 0
    },
    {
      name: 'Together AI',
      type: 'together',
      key: togetherKey || null,
      baseUrl: providerBaseUrl('together') || null,
      enabled: togetherKey ? 1 : 0
    }
  ];

  for (const p of providers) {
    const id = `prov_${nanoid(8)}`;
    // Without a master key, keep credentials only in the environment.
    const storedKey = p.key && process.env.AUTOORG_PROVIDER_ENCRYPTION_KEY
      ? encryptProviderKey(p.key, id) : null;
    db.prepare(`
      INSERT OR IGNORE INTO llm_providers (id, name, provider_type, api_key, base_url, is_enabled, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, p.name, p.type, storedKey, p.baseUrl, p.enabled, p.type === 'anthropic' ? 1 : 0);

    const status = p.enabled ? chalk.green('enabled') : chalk.gray('no key — disabled');
    console.log(`  ✓ Seeded provider: ${p.name} (${p.type}) — ${status}`);
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Provider seeding complete.\n'));
}

main().catch(err => {
  console.error(chalk.red(`\n❌ Provider seeding failed: ${err instanceof Error ? err.message : err}`));
  process.exit(1);
});
