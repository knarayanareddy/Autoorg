import { BaseAdapter } from './base-adapter.js';
import { estimateCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly provider: LLMProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(provider: LLMProvider, baseUrl?: string, apiKey?: string) {
    super();
    this.provider = provider;
    const envPrefix = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    this.baseUrl = baseUrl ?? process.env[`AUTOORG_BASE_URL_${envPrefix}`] ?? '';
    this.apiKey = apiKey ?? process.env[`AUTOORG_API_KEY_${envPrefix}`] ?? '';
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        ...(opts.stopSequences && { stop: opts.stopSequences }),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    return {
      content,
      usage: { inputTokens, outputTokens },
      costUsd: estimateCost(opts.model, inputTokens, outputTokens),
      model: opts.model,
    };
  }
}
