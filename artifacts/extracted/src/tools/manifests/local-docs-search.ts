TypeScript

import { z } from 'zod';
import { localDocsSearch } from '@/integrations/connectors/local-docs.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const localDocsSearchTool: ToolDefinition = {
  name: 'local_docs.search',
  displayName: 'Local Docs Search',
  capabilityClass: 'search',
  description: 'Search markdown/docs/memory files on disk.',
  inputSchema: z.object({
    query: z.string(),
    root: z.string().default('memory'),
    limit: z.number().int().min(1).max(30).default(12),
  }),
  outputSchema: z.object({
    summary: z.string(),
    hits: z.array(z.object({
      file: z.string(),
      excerpt: z.string(),
    })),
  }),
  defaultTimeoutMs: 4000,
  replayable: true,
  dangerous: false,
  async execute(input) {
    const result = await localDocsSearch(input.query, input.root, input.limit);
    return {
      summary: result.summary,
      deterministic: true,
      output: result,
      sources: result.hits.map((hit) => ({
        type: 'file_hit',
        uri: hit.file,
        title: hit.file,
        excerpt: hit.excerpt,
      })),
    };
  },
};