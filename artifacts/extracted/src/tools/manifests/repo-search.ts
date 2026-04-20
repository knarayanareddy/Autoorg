TypeScript

import { z } from 'zod';
import { repoSearchConnector } from '@/integrations/connectors/repo-search.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const repoSearchTool: ToolDefinition = {
  name: 'repo.search',
  displayName: 'Repository Search',
  capabilityClass: 'search',
  description: 'Search the repo using ripgrep and return matching lines.',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(50).default(20),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    lines: z.array(z.object({
      file: z.string(),
      line: z.number(),
      text: z.string(),
    })),
  }),
  defaultTimeoutMs: 5000,
  replayable: true,
  dangerous: false,
  async execute(input, ctx) {
    const result = await repoSearchConnector(input.query, input.cwd ?? ctx.cwd ?? process.cwd(), input.limit);
    return {
      summary: result.summary,
      deterministic: true,
      output: result,
      sources: result.lines.map((line) => ({
        type: 'file_hit',
        uri: line.file,
        title: `${line.file}:${line.line}`,
        excerpt: line.text,
        metadata: { line: line.line },
      })),
    };
  },
};