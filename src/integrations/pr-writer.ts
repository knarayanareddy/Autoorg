import { getAdapter } from '@/adapters/adapter-factory.js';
import type { ModelConfig, LLMProvider } from '@/types/index.js';

export async function generatePrDraft(opts: {
  summary: string;
  filesChanged: string[];
  riskNotes: string[];
}) {
  const model: ModelConfig = {
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
    model: 'claude-3-5-sonnet-latest',
  };

  const adapter = getAdapter(model);
  const response = await adapter.run({
    model: model.model,
    messages: [
      {
        role: 'system',
        content: 'You are an autonomous organization’s PR Writer. You write concise, high-quality, professional pull request titles and bodies.',
      },
      {
        role: 'user',
        content: `
Generate a PR draft for the following changes.

SUMMARY OF CHANGES:
${opts.summary}

FILES AFFECTED:
${opts.filesChanged.join('\n')}

RISK ANALYSIS / NOTES:
${opts.riskNotes.join('\n')}

Return your output in the following format:
TITLE: [Your concise PR title]
BODY:
[Your detailed PR body, including background, impact, and verification steps.]
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
