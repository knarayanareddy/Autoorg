TypeScript

import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition } from '@/tools/registry.js';

export const repoReadFileTool: ToolDefinition = {
  name: 'repo.read_file',
  displayName: 'Repository File Read',
  capabilityClass: 'read',
  description: 'Read a file from the repository with path restrictions.',
  inputSchema: z.object({
    path: z.string(),
    maxChars: z.number().int().min(100).max(30000).default(8000),
  }),
  outputSchema: z.object({
    path: z.string(),
    text: z.string(),
  }),
  defaultTimeoutMs: 3000,
  replayable: true,
  dangerous: false,
  async execute(input, ctx) {
    const resolved = path.resolve(process.cwd(), input.path);
    if (!resolved.startsWith(process.cwd())) {
      throw new Error('Path escapes repository root');
    }

    const text = await readFile(resolved, 'utf-8');
    return {
      summary: `Read file ${input.path}`,
      deterministic: true,
      output: { path: input.path, text: text.slice(0, input.maxChars) },
      sources: [{
        type: 'file_hit',
        uri: input.path,
        title: input.path,
        excerpt: text.slice(0, Math.min(input.maxChars, 500)),
      }],
    };
  },
};