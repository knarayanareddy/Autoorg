TypeScript

import simpleGit from 'simple-git';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { DIFF_SUMMARIZER_SYSTEM_PROMPT, DiffSummarySchema } from '@/prompts/diff-summarizer.js';

export async function summarizeGitDiff(opts?: {
  baseRef?: string;
  headRef?: string;
  maxChars?: number;
}) {
  const git = simpleGit();
  const baseRef = opts?.baseRef ?? 'HEAD~1';
  const headRef = opts?.headRef ?? 'HEAD';
  const maxChars = opts?.maxChars ?? 20_000;

  const stat = await git.diffSummary([`${baseRef}..${headRef}`]);
  const diff = await git.diff(['--unified=1', `${baseRef}..${headRef}`]);

  const adapter = getAdapter({
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
    model: 'claude-sonnet-4-5',
  });

  const result = await adapter.structured({
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'system', content: DIFF_SUMMARIZER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          baseRef,
          headRef,
          changedFiles: stat.files.map(f => ({
            file: f.file,
            insertions: f.insertions,
            deletions: f.deletions,
          })),
          diff: diff.slice(0, maxChars),
        }, null, 2),
      },
    ],
    schema: DiffSummarySchema,
  });

  return result;
}
Patch src/integrations/pr-writer.ts
Replace generatePrDraft(...) with:

TypeScript

import { summarizeGitDiff } from '@/integrations/diff-summarizer.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import type { ModelConfig, LLMProvider } from '@/types/index.js';

export async function generatePrDraftFromDiff(opts?: {
  baseRef?: string;
  headRef?: string;
}) {
  const diffSummary = await summarizeGitDiff({
    baseRef: opts?.baseRef ?? 'HEAD~1',
    headRef: opts?.headRef ?? 'HEAD',
  });

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
        content: 'You write concise, high-quality pull request titles and bodies from a structured diff summary.',
      },
      {
        role: 'user',
        content: `
Create a PR title and body from this structured diff summary.

Summary:
${diffSummary.summary}

Files changed:
${diffSummary.files_changed.map(x => `- ${x}`).join('\n')}

Risk notes:
${diffSummary.risk_notes.map(x => `- ${x}`).join('\n')}

Suggested tests:
${diffSummary.tests_suggested.map(x => `- ${x}`).join('\n')}

Rollback plan:
${diffSummary.rollback_plan}

Return plain text:
TITLE: ...
BODY: ...
        `.trim(),
      },
    ],
    maxTokens: 1400,
    temperature: 0.2,
  });

  const text = response.content;
  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/);

  return {
    title: titleMatch?.[1]?.trim() ?? 'AutoOrg update',
    body: bodyMatch?.[1]?.trim() ?? text,
    costUsd: response.costUsd,
    summary: diffSummary,
  };
}
13. ULTRAPLAN SLAs