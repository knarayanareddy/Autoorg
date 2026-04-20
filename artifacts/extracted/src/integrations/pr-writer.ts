TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import type { ModelConfig, LLMProvider } from '@/types/index.js';

export async function generatePrDraft(opts: {
  summary: string;
  filesChanged: string[];
  riskNotes: string[];
}) {
  const model: ModelConfig = {
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
    model: 'claude-sonnet-4-5',
  };

  const adapter = getAdapter(model);
  const response = await adapter.run({
    model: model.model,
    messages: [
      {
        role: 'system',
        content: 'You write concise, high-quality pull request titles and bodies.',
      },
      {
        role: 'user',
        content: `
Generate a PR draft.

Summary:
${opts.summary}

Files changed:
${opts.filesChanged.join('\n')}

Risk notes:
${opts.riskNotes.join('\n')}

Return plain text:
TITLE: ...
BODY:
...
`.trim(),
      },
    ],
    maxTokens: 1200,
    temperature: 0.3,
  });

  const text = response.content;
  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/);

  return {
    title: titleMatch?.[1]?.trim() ?? 'AutoOrg update',
    body: bodyMatch?.[1]?.trim() ?? text,
    costUsd: response.costUsd,
  };
}