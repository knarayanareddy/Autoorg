TypeScript

import { ToolRegistry } from '@/tools/registry.js';
import { repoSearchTool } from '@/tools/manifests/repo-search.js';
import { repoReadFileTool } from '@/tools/manifests/repo-read-file.js';
import { localDocsSearchTool } from '@/tools/manifests/local-docs-search.js';
import { webFetchTool } from '@/tools/manifests/web-fetch.js';
import { githubSearchTool } from '@/tools/manifests/github-search.js';
import { sandboxExecTool } from '@/tools/manifests/sandbox-exec.js';

export function bootstrapRegistry() {
  const registry = new ToolRegistry();
  registry.register(repoSearchTool);
  registry.register(repoReadFileTool);
  registry.register(localDocsSearchTool);
  registry.register(webFetchTool);
  registry.register(githubSearchTool);
  registry.register(sandboxExecTool);
  return registry;
}
15. AgentRunner integration
Patch src/runtime/agent-runner.ts
Add imports:

TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import { ToolRunner } from '@/tools/tool-runner.js';
import { ToolPolicy } from '@/tools/tool-policy.js';
import { bootstrapRegistry } from '@/tools/bootstrap.js';
import { EvidencePackBuilder } from '@/tools/evidence-pack.js';
import { TOOL_PLANNER_SYSTEM_PROMPT, ToolPlanSchema } from '@/prompts/tool-planner.js';
import { EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT } from '@/prompts/evidence-synthesizer.js';
import { featureFlag } from '@/config/feature-flags.js';
Then add a tool-aware execution path:

TypeScript

export class AgentRunner {
  static async runWithTools(ctx: {
    runId: string;
    cycle: number;
    role: string;
    task: string;
    prompt: string;
    teamId?: string;
    taskId?: string;
    model: string;
    provider?: any;
    memoryContext?: string;
    graphContext?: string;
    workspaceContext?: string;
  }) {
    const adapter = getAdapter({
      provider: (ctx.provider ?? process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: ctx.model,
    });

    const registry = bootstrapRegistry();
    const policies = new ToolPolicy(ctx.runId);
    const toolRunner = new ToolRunner(ctx.runId, registry);
    const evidence = new EvidencePackBuilder(ctx.runId);

    const availableTools = registry.list()
      .filter(t => policies.isAllowed({ role: ctx.role, toolName: t.name, teamId: ctx.teamId }))
      .map(t => ({
        name: t.name,
        class: t.capabilityClass,
        description: t.description,
      }));

    let executionIds: string[] = [];
    let evidencePackId: string | undefined;

    if (featureFlag('toolUse') && availableTools.length > 0) {
      const plan = await adapter.structured({
        model: ctx.model,
        messages: [
          { role: 'system', content: TOOL_PLANNER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              role: ctx.role,
              task: ctx.task,
              availableTools,
              memoryContext: ctx.memoryContext ?? '',
              graphContext: ctx.graphContext ?? '',
              workspaceContext: (ctx.workspaceContext ?? '').slice(0, 4000),
            }, null, 2),
          },
        ],
        schema: ToolPlanSchema,
      });

      for (const call of plan.tool_calls ?? []) {
        const result = await toolRunner.execute(call.tool_name, call.args, {
          runId: ctx.runId,
          cycleNumber: ctx.cycle,
          role: ctx.role,
          teamId: ctx.teamId,
          taskId: ctx.taskId,
          cwd: process.cwd(),
        });
        executionIds.push(result.executionId);
      }

      if (executionIds.length > 0 && featureFlag('evidencePacks')) {
        const pack = await evidence.fromExecutions({
          cycleNumber: ctx.cycle,
          ownerRole: ctx.role,
          teamId: ctx.teamId,
          taskId: ctx.taskId,
          kind: 'worker',
          executionIds,
          summary: `${ctx.role} evidence for task`,
        });
        evidencePackId = pack.packId;
      }
    }

    const evidenceText = evidencePackId
      ? await Bun.file(`artifacts/evidence/packs/${evidencePackId}.md`).text().catch(() => '')
      : '';

    const response = await adapter.run({
      model: ctx.model,
      messages: [
        { role: 'system', content: EVIDENCE_SYNTHESIZER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            ctx.prompt,
            '',
            '## TASK',
            ctx.task,
            '',
            '## MEMORY CONTEXT',
            ctx.memoryContext ?? '',
            '',
            '## GRAPH CONTEXT',
            ctx.graphContext ?? '',
            '',
            '## WORKSPACE CONTEXT',
            (ctx.workspaceContext ?? '').slice(0, 6000),
            '',
            '## EVIDENCE PACK',
            evidenceText.slice(0, 12000),
          ].join('\n'),
        },
      ],
      temperature: 0.2,
      maxTokens: 2400,
    });

    return {
      content: response.content,
      evidencePackId,
      toolExecutionIds: executionIds,
      usage: response.usage,
      costUsd: response.costUsd,
    };
  }
}
Net effect: every worker can now:

plan tool use,
call only allowed tools,
generate an evidence pack,
answer from that evidence pack.
16. Verification audit + groundedness clamp