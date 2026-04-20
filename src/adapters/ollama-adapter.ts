import { BaseAdapter } from './base-adapter.js';
import type { LLMProvider, LLMResponse, LLMRunOptions } from '@/types/index.js';

export class OllamaAdapter extends BaseAdapter {
  readonly provider: LLMProvider = 'ollama';
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false,
        options: {
          temperature: opts.temperature,
          num_predict: opts.maxTokens,
          stop: opts.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.message?.content ?? '';

    return {
      content,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      costUsd: 0,
      model: opts.model,
    };
  }
}
