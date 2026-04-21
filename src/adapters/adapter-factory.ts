// src/adapters/adapter-factory.ts
import { AnthropicAdapter } from '@/adapters/anthropic-adapter.js';
import { OpenAIAdapter } from '@/adapters/openai-adapter.js';
import { OllamaAdapter } from '@/adapters/ollama-adapter.js';
import { OpenAICompatibleAdapter } from '@/adapters/openai-compatible-adapter.js';
import { GeminiAdapter } from '@/adapters/gemini-adapter.js';
import { getDb } from '@/db/migrate.js';
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

  // Phase 15: Try to find a dynamic configuration in the database
  try {
    const db = getDb();
    const dbProv = db.prepare(`
      SELECT * FROM llm_providers 
      WHERE provider_type = ? AND is_enabled = 1
      ORDER BY is_default DESC, created_at DESC 
      LIMIT 1
    `).get(providerType) as any;

    if (dbProv) {
      const adapter = createAdapter(dbProv.provider_type as LLMProvider, dbProv.api_key, dbProv.base_url);
      adapters.set(cacheKey, adapter);
      return adapter;
    }
  } catch (err) {
    // If DB fails (e.g. table doesn't exist yet), fallback to env-only mode
    console.debug(`[AdapterFactory] Dynamic provider lookup failed, using environment fallbacks. error=${err}`);
  }

  // Fallback to environment variables (Legacy/Phase 1-14 mode)
  const adapter = createAdapter(providerType, apiKey, baseUrl);
  adapters.set(cacheKey, adapter);
  return adapter;
}

function createAdapter(type: LLMProvider, apiKey?: string, baseUrl?: string): LLMAdapter {
  switch (type) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey);
    case 'openai':
      return new OpenAIAdapter(apiKey);
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
