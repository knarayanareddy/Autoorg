// src/adapters/base-adapter.ts
import type { LLMAdapter, LLMMessage, LLMResponse, LLMRunOptions, LLMStructuredOptions } from '@/types/index.js';

export abstract class BaseAdapter implements LLMAdapter {
  abstract provider: import('@/types/index.js').LLMProvider;

  abstract run(opts: LLMRunOptions): Promise<LLMResponse>;

  async structured<T>(opts: LLMStructuredOptions<T>): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.run({
          model: opts.model,
          messages: [
            ...opts.messages,
            {
              role: 'user' as const,
              content: attempt === 1
                ? 'Respond with valid JSON matching the required schema. No markdown. No explanation.'
                : `Attempt ${attempt}. Previous response was not valid JSON. Respond ONLY with valid JSON.`,
            },
          ],
          temperature: opts.temperature ?? 0.1,
          maxTokens: opts.maxTokens ?? 4096,
        });

        const text = response.content.trim();

        // Strip markdown fences if present
        const jsonText = text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(jsonText);
        const validated = opts.schema.parse(parsed);

        // Attach usage metadata to result
        return Object.assign(validated as object, {
          _usage: response.usage,
          _costUsd: response.costUsd,
        }) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    throw new Error(`structured() failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
}
