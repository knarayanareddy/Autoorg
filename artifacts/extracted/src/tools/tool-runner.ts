TypeScript

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ToolRegistry, type ToolExecutionContext } from '@/tools/registry.js';
import { ToolPolicy } from '@/tools/tool-policy.js';
import { BudgetManager } from '@/runtime/budget-manager.js';
import { IncidentLog } from '@/runtime/incident-log.js';

export class ToolRunner {
  private policies: ToolPolicy;
  private budgets: BudgetManager;
  private incidents = new IncidentLog();

  constructor(
    private runId: string,
    private registry: ToolRegistry,
  ) {
    this.policies = new ToolPolicy(runId);
    this.budgets = new BudgetManager(runId);
  }

  async execute(toolName: string, input: unknown, ctx: ToolExecutionContext) {
    const tool = this.registry.get(toolName);

    if (!this.policies.isAllowed({ role: ctx.role, teamId: ctx.teamId, toolName })) {
      return await this.denied(toolName, input, ctx, `Tool ${toolName} is not allowed for role ${ctx.role}`);
    }

    if (!this.budgets.canSpend(ctx.teamId ?? 'shared', 'tool_calls', 1)) {
      return await this.denied(toolName, input, ctx, `Tool-call budget exceeded`);
    }

    const parsed = tool.inputSchema.parse(input);
    const id = `tx_${nanoid(10)}`;
    const startedAt = Date.now();
    const artifactsDir = path.join(process.cwd(), 'artifacts', 'tools', 'outputs');
    await mkdir(artifactsDir, { recursive: true });

    const db = getDb();
    db.prepare(`
      INSERT INTO tool_executions
      (id, run_id, cycle_number, task_id, team_id, role, tool_name, capability_class, status, input_json, started_at, replayable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, datetime('now'), ?)
    `).run(
      id,
      this.runId,
      ctx.cycleNumber,
      ctx.taskId ?? null,
      ctx.teamId ?? null,
      ctx.role,
      toolName,
      tool.capabilityClass,
      JSON.stringify(parsed),
      tool.replayable ? 1 : 0,
    );
    db.close();

    this.budgets.spend({
      teamId: ctx.teamId ?? 'shared',
      role: ctx.role,
      cycleNumber: ctx.cycleNumber,
      budgetType: 'tool_calls',
      delta: 1,
      reason: `tool:${toolName}`,
    });

    try {
      const result = await tool.execute(parsed, ctx);
      const durationMs = Date.now() - startedAt;
      const artifactPath = path.join(artifactsDir, `${id}.json`);

      await writeFile(artifactPath, JSON.stringify({
        toolName,
        input: parsed,
        result,
        ctx,
      }, null, 2), 'utf-8');

      const db2 = getDb();
      db2.prepare(`
        UPDATE tool_executions
        SET status = 'completed',
            output_summary = ?,
            artifact_path = ?,
            duration_ms = ?,
            cost_usd = ?,
            source_count = ?,
            deterministic = ?,
            finished_at = datetime('now')
        WHERE id = ?
      `).run(
        result.summary,
        artifactPath,
        durationMs,
        result.costUsd ?? 0,
        result.sources?.length ?? 0,
        result.deterministic ? 1 : 0,
        id,
      );

      for (const src of result.sources ?? []) {
        db2.prepare(`
          INSERT INTO tool_artifacts
          (id, execution_id, artifact_type, source_uri, title, excerpt, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `ta_${nanoid(8)}`,
          id,
          src.type,
          src.uri ?? null,
          src.title ?? null,
          src.excerpt?.slice(0, 1500) ?? '',
          JSON.stringify(src.metadata ?? {}),
        );
      }

      db2.close();

      if (typeof result.costUsd === 'number' && result.costUsd > 0) {
        this.budgets.spend({
          teamId: ctx.teamId ?? 'shared',
          role: ctx.role,
          cycleNumber: ctx.cycleNumber,
          budgetType: 'usd',
          delta: result.costUsd,
          reason: `tool:${toolName}`,
        });
      }

      if (durationMs > 0) {
        this.budgets.spend({
          teamId: ctx.teamId ?? 'shared',
          role: ctx.role,
          cycleNumber: ctx.cycleNumber,
          budgetType: 'minutes',
          delta: durationMs / 60000,
          reason: `tool:${toolName}`,
        });
      }

      return { executionId: id, ...result };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE tool_executions
        SET status = 'failed', error_text = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(error instanceof Error ? error.message : String(error), id);
      db3.close();

      this.incidents.log({
        runId: this.runId,
        severity: 'warn',
        component: 'tool-runner',
        summary: `Tool ${toolName} failed`,
        details: {
          executionId: id,
          role: ctx.role,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      throw error;
    }
  }

  private async denied(toolName: string, input: unknown, ctx: ToolExecutionContext, reason: string) {
    const id = `tx_${nanoid(10)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO tool_executions
      (id, run_id, cycle_number, task_id, team_id, role, tool_name, capability_class, status, input_json, error_text, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'verify', 'denied', ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      this.runId,
      ctx.cycleNumber,
      ctx.taskId ?? null,
      ctx.teamId ?? null,
      ctx.role,
      toolName,
      JSON.stringify(input ?? {}),
      reason,
    );
    db.close();

    return {
      executionId: id,
      summary: reason,
      output: { denied: true, reason },
      sources: [],
    };
  }
}
8. Evidence packs