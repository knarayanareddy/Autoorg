// src/adapters/openai-adapter.ts
import OpenAI from 'openai';
import { BaseAdapter } from '@/adapters/base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class OpenAIAdapter extends BaseAdapter {
  provider: LLMProvider = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    super();
    const key = apiKey ?? process.env.AUTOORG_API_KEY_OPENAI || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API key is not set');
    this.client = new OpenAI({ apiKey: key });
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
    const costUsd = estimateCost(opts.model, inputTokens, outputTokens);

    if (process.env.AUTOORG_DEBUG_LLM === '1') {
      console.debug(`[OpenAIAdapter] model=${opts.model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)}`);
    }

    return {
      content,
      usage: { inputTokens, outputTokens },
      costUsd,
      model: opts.model,
    };
  }
}
