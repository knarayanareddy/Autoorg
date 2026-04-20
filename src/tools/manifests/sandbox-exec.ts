import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from '../registry.js';
import { sandbox } from '../sandbox.js';

const SandboxExecSchema = z.object({
  command: z.string().describe('The shell command or script to execute in the sandbox.'),
  timeout: z.number().optional().default(30000).describe('Timeout in ms.')
});

export const SandboxExecTool: ToolDefinition<z.infer<typeof SandboxExecSchema>> = {
  name: 'sandbox.exec',
  displayName: 'Sandbox Execution',
  capabilityClass: 'execute',
  description: 'Execute shell commands or code in a restricted/sandboxed environment.',
  inputSchema: SandboxExecSchema,
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number()
  }),
  dangerous: true,
  defaultTimeoutMs: 35000,
  execute: async (input, ctx) => {
    const res = await sandbox.run(input.command, { timeout: input.timeout, cwd: ctx.cwd });
    return {
      summary: `Executed: ${input.command.slice(0, 50)} (Exit: ${res.exitCode})`,
      sources: [
        { type: 'stdout', title: 'Standard Output', excerpt: res.stdout.slice(0, 1000) },
        { type: 'stderr', title: 'Standard Error', excerpt: res.stderr.slice(0, 1000) }
      ],
      output: res
    };
  }
};

toolRegistry.register(SandboxExecTool);
