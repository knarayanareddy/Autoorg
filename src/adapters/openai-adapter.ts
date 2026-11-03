// src/adapters/openai-adapter.ts
import OpenAI from 'openai';
import { BaseAdapter } from '@/adapters/base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';
import { providerApiKey, providerBaseUrl } from '@/config/env.js';

export class OpenAIAdapter extends BaseAdapter {
  provider: LLMProvider = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    super();
    const key = providerApiKey('openai', apiKey);
    if (!key) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY in .env (see .env.example).'
      );
    }
    // OPENAI_BASE_URL lets this point at LM Studio / Together / any compatible API.
    const resolvedBaseUrl = providerBaseUrl('openai', baseUrl);
    this.client = new OpenAI({
      apiKey: key,
      maxRetries: 0, // Retry only through the budget-aware application layer.
      ...(resolvedBaseUrl ? { baseURL: resolvedBaseUrl } : {}),
    });
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      messages: opts.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = response.usage ? estimateCost(opts.model, inputTokens, outputTokens) : undefined;

    if (process.env.AUTOORG_DEBUG_LLM === '1') {
      console.debug(`[OpenAIAdapter] model=${opts.model} in=${inputTokens} out=${outputTokens} cost=$${costUsd?.toFixed(6) ?? "unknown"}`);
    }

    return {
      content,
      usage: { inputTokens, outputTokens },
      promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens,
      costUsd,
      model: opts.model,
    };
  }
}
