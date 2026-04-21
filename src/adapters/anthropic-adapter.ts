// src/adapters/anthropic-adapter.ts
import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from '@/adapters/base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class AnthropicAdapter extends BaseAdapter {
  provider: LLMProvider = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    super();
    const key = apiKey ?? process.env.AUTOORG_API_KEY_ANTHROPIC;
    if (!key) throw new Error('Anthropic API key is not set');
    this.client = new Anthropic({ apiKey: key });
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const systemMessage = opts.messages.find(m => m.role === 'system');
    const userMessages = opts.messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      system: systemMessage?.content,
      messages: userMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = estimateCost(opts.model, inputTokens, outputTokens);

    if (process.env.AUTOORG_DEBUG_LLM === '1') {
      console.debug(`[AnthropicAdapter] model=${opts.model} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)}`);
    }

    return {
      content,
      usage: { inputTokens, outputTokens },
      costUsd,
      model: opts.model,
    };
  }
}
