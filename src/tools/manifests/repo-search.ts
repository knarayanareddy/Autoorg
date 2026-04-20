import { z } from 'zod';
import { toolRegistry, type ToolDefinition, type ToolResult } from '../registry.js';
import { repoSearchConnector } from '@/integrations/connectors/repo-search.js';

const RepoSearchSchema = z.object({
  query: z.string().describe('The search query to find in the repository.'),
  limit: z.number().optional().default(15).describe('Max results to return.')
});

export const RepoSearchTool: ToolDefinition<z.infer<typeof RepoSearchSchema>> = {
  name: 'repo.search',
  displayName: 'Repository Search',
  capabilityClass: 'search',
  description: 'Search for text patterns in the local repository using ripgrep.',
  inputSchema: RepoSearchSchema as any,
  outputSchema: z.object({
    summary: z.string(),
    lines: z.array(z.object({
      file: z.string(),
      line: z.number(),
      text: z.string()
    }))
  }),
  defaultTimeoutMs: 15000,
  execute: async (input, ctx) => {
    const res = await repoSearchConnector(input.query, ctx.cwd, input.limit);
    return {
      summary: res.summary,
      sources: res.lines.map(l => ({
        type: 'file_hit',
        uri: l.file,
        title: `${l.file}:${l.line}`,
        excerpt: l.text
      })),
      output: res
    };
  }
};

toolRegistry.register(RepoSearchTool);
