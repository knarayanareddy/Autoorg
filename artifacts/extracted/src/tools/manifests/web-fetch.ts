TypeScript

import { z } from 'zod';
import { safeWebFetch } from '@/integrations/connectors/web-fetch.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const webFetchTool: ToolDefinition = {
  name: 'web.fetch',
  displayName: 'Web Fetch',
  capabilityClass: 'verify',
  description: 'Fetch a public URL and extract plain text for verification.',
  inputSchema: z.object({
    url: z.string().url(),
    maxChars: z.number().int().min(500).max(20000).default(8000),
  }),
  outputSchema: z.object({
    summary: z.string(),
    contentType: z.string(),
    text: z.string(),
  }),
  defaultTimeoutMs: 12000,
  replayable: true,
  dangerous: false,
  async execute(input) {
    const result = await safeWebFetch(input.url, input.maxChars);
    return {
      summary: result.summary,
      deterministic: false,
      output: result,
      sources: [{
        type: 'web_page',
        uri: input.url,
        title: input.url,
        excerpt: result.text.slice(0, 500),
      }],
    };
  },
};