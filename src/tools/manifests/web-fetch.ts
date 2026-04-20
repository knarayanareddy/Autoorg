import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../registry.js';
import { safeWebFetch } from '@/integrations/connectors/web-fetch.js';

const WebFetchSchema = z.object({
  url: z.string().url().describe('The URL to fetch and extract text from.'),
  maxChars: z.number().optional().default(8000).describe('Max characters to extract.')
});

export const WebFetchTool: ToolDefinition<z.infer<typeof WebFetchSchema>> = {
  name: 'web.fetch',
  displayName: 'Web Fetch',
  capabilityClass: 'read',
  description: 'Fetch a web page and extract clean text content for analysis.',
  inputSchema: WebFetchSchema as any,
  outputSchema: z.object({
    summary: z.string(),
    text: z.string(),
    status: z.number()
  }),
  defaultTimeoutMs: 15000,
  execute: async (input) => {
    const res = await safeWebFetch(input.url, input.maxChars);
    return {
      summary: res.summary,
      sources: [{
        type: 'web_page',
        uri: input.url,
        title: input.url,
        excerpt: res.text.slice(0, 500)
      }],
      output: res
    };
  }
};

toolRegistry.register(WebFetchTool);
