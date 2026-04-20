TypeScript

import { z } from 'zod';
import { Sandbox } from '@/tools/sandbox.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const sandboxExecTool: ToolDefinition = {
  name: 'sandbox.exec',
  displayName: 'Sandboxed Exec',
  capabilityClass: 'execute',
  description: 'Run an allowlisted command in the workspace with timeout and env scrubbing.',
  inputSchema: z.object({
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().int().min(500).max(120000).default(20000),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  defaultTimeoutMs: 20000,
  replayable: true,
  dangerous: true,
  async execute(input, ctx) {
    const sandbox = new Sandbox();
    const result = await sandbox.exec(input.command, {
      cwd: input.cwd ?? ctx.cwd ?? process.cwd(),
      timeoutMs: input.timeoutMs,
    });

    return {
      summary: `Executed sandbox command: ${input.command}`,
      deterministic: false,
      output: result,
      sources: [
        { type: 'stdout', title: 'stdout', excerpt: result.stdout.slice(0, 600) },
        { type: 'stderr', title: 'stderr', excerpt: result.stderr.slice(0, 600) },
      ],
    };
  },
};
6. Sandbox execution