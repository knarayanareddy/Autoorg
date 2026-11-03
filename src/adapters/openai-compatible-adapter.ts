import { BaseAdapter } from './base-adapter.js';
import { estimateReportedCost } from '@/config/model-costs.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';
import { providerApiKey, providerBaseUrl } from '@/config/env.js';

export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly provider: LLMProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(provider: LLMProvider, baseUrl?: string, apiKey?: string) {
    super();
    this.provider = provider;
    // GROQ_API_KEY / GROQ_BASE_URL (documented) or the AUTOORG_* legacy names.
    this.baseUrl = providerBaseUrl(provider as never, baseUrl);
    this.apiKey = providerApiKey(provider as never, apiKey);
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
      promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens,
      costUsd: estimateReportedCost(opts.model, data.usage?.prompt_tokens, data.usage?.completion_tokens),
      model: opts.model,
    };
  }
}
