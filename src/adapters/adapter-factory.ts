// src/adapters/adapter-factory.ts
import { AnthropicAdapter } from '@/adapters/anthropic-adapter.js';
import { OpenAIAdapter } from '@/adapters/openai-adapter.js';
import type { LLMAdapter, LLMProvider, ModelConfig } from '@/types/index.js';

const adapters = new Map<LLMProvider, LLMAdapter>();

export function getAdapter(config: ModelConfig | { provider: LLMProvider; model?: string }): LLMAdapter {
  const provider = config.provider;

  if (!adapters.has(provider)) {
    switch (provider) {
      case 'anthropic':
        adapters.set('anthropic', new AnthropicAdapter());
        break;
      case 'openai':
        adapters.set('openai', new OpenAIAdapter());
        break;
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }

  return adapters.get(provider)!;
}

export function getAdapterForModel(model: string): LLMAdapter {
  const isAnthropic = model.startsWith('claude');
  const isOpenAI = model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3');

  if (isAnthropic) return getAdapter({ provider: 'anthropic', model });
  if (isOpenAI) return getAdapter({ provider: 'openai', model });

  const defaultProvider = (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider;
  return getAdapter({ provider: defaultProvider, model });
}
