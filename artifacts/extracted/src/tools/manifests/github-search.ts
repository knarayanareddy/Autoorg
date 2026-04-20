TypeScript

import { z } from 'zod';
import { githubSearchConnector } from '@/integrations/connectors/github-search.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const githubSearchTool: ToolDefinition = {
  name: 'github.search',
  displayName: 'GitHub Search',
  capabilityClass: 'search',
  description: 'Search GitHub issues/PRs using the configured GitHub integration.',
  inputSchema: z.object({
    repo: z.string().optional(),
    query: z.string(),
    type: z.enum(['issues', 'prs']).default('issues'),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  outputSchema: z.object({
    summary: z.string(),
    items: z.array(z.object({
      number: z.number(),
      title: z.string(),
      url: z.string(),
      state: z.string(),
      body: z.string(),
    })),
  }),
  defaultTimeoutMs: 10000,
  replayable: true,
  dangerous: false,
  async execute(input) {
    const result = await githubSearchConnector(input);
    return {
      summary: result.summary,
      deterministic: false,
      output: result,
      sources: result.items.map((item) => ({
        type: input.type === 'prs' ? 'github_pr' : 'github_issue',
        uri: item.url,
        title: `#${item.number} ${item.title}`,
        excerpt: item.body,
      })),
    };
  },
};