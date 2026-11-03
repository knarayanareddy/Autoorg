// src/adapters/adapter-factory.ts
import { AnthropicAdapter } from '@/adapters/anthropic-adapter.js';
import { OpenAIAdapter } from '@/adapters/openai-adapter.js';
import { OllamaAdapter } from '@/adapters/ollama-adapter.js';
import { OpenAICompatibleAdapter } from '@/adapters/openai-compatible-adapter.js';
import { GeminiAdapter } from '@/adapters/gemini-adapter.js';
import { getDb } from '@/db/migrate.js';
import { decryptProviderKey } from '@/config/provider-secrets.js';
import type { LLMAdapter, LLMProvider, ModelConfig } from '@/types/index.js';

const adapters = new Map<string, LLMAdapter>();

/**
 * Resolves an LLM adapter, prioritizing database configuration (Phase 15).
 */
export function getAdapter(config: ModelConfig | { provider: LLMProvider; model?: string }): LLMAdapter {
  const providerType = config.provider;
  const apiKey = (config as ModelConfig).apiKey;
  const baseUrl = (config as ModelConfig).baseUrl;
  const cacheKey = `${providerType}:${apiKey ?? 'default'}:${baseUrl ?? 'default'}`;

  if (adapters.has(cacheKey)) {
    return adapters.get(cacheKey)!;
  }

  // A missing table may use environment fallback, but never swallow a failure
  // to decrypt a configured credential and silently use a different provider key.
  let dbProv: { id: string; provider_type: LLMProvider; api_key: string | null; base_url: string | null } | undefined;
  try {
    const db = getDb();
    try {
      dbProv = db.prepare(`
        SELECT id, provider_type, api_key, base_url FROM llm_providers
        WHERE provider_type = ? AND is_enabled = 1
        ORDER BY is_default DESC, created_at DESC LIMIT 1
      `).get(providerType) as typeof dbProv;
    } finally { db.close(); }
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('no such table: llm_providers')) throw err;
  }
  if (dbProv) {
    const storedKey = dbProv.api_key ? decryptProviderKey(dbProv.api_key, dbProv.id) : undefined;
    const adapter = createAdapter(dbProv.provider_type, storedKey ?? apiKey, dbProv.base_url ?? baseUrl);
    adapters.set(cacheKey, adapter);
    return adapter;
  }

  // Fallback to environment variables (Legacy/Phase 1-14 mode)
  const adapter = createAdapter(providerType, apiKey, baseUrl);
  adapters.set(cacheKey, adapter);
  return adapter;
}

function createAdapter(type: LLMProvider, apiKey?: string, baseUrl?: string): LLMAdapter {
  switch (type) {
    case 'anthropic':
      // ANTHROPIC_BASE_URL is honoured for proxies (documented in .env.example).
      return new AnthropicAdapter(apiKey, baseUrl);
    case 'openai':
      // OPENAI_BASE_URL is honoured for LM Studio / Together / compatible APIs.
      return new OpenAIAdapter(apiKey, baseUrl);
    case 'ollama':
      return new OllamaAdapter(baseUrl);
    case 'gemini':
      // Native Google Generative AI SDK — supports vision, native embeddings, structured output
      return new GeminiAdapter('gemini-1.5-flash-latest', apiKey);
    case 'groq':
    case 'together':
    case 'custom':
      // OpenAI-compatible providers
      return new OpenAICompatibleAdapter(type, baseUrl, apiKey);
    default:
      throw new Error(`Unsupported LLM provider type: ${type}`);
  }
}

export function getAdapterForModel(model: string): LLMAdapter {
  const isAnthropic = model.startsWith('claude');
  const isOpenAI = model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3');

  if (isAnthropic) return getAdapter({ provider: 'anthropic', model });
  if (isOpenAI) return getAdapter({ provider: 'openai', model });

  const defaultProvider = (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider;
  return getAdapter({ provider: defaultProvider, model });
}
