import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { toolRegistry, type ToolExecutionContext } from './registry.js';
import { ToolPolicy }        from './tool-policy.js';
import chalk                 from 'chalk';
import { PolicyEngine }      from '@/runtime/policy-engine.js';
import { ActionLedger }      from '@/runtime/action-ledger.js';
import { SafetyReview }      from '@/runtime/safety-review.js';
import { featureFlag }        from '@/config/feature-flags.js';

export class ToolRunner {
  private policy: ToolPolicy;
  private policies: PolicyEngine;
  private ledger: ActionLedger;
  private safety: SafetyReview;

  constructor(private runId: string) {
    this.policy = new ToolPolicy(runId);
    this.policies = new PolicyEngine(runId);
    this.ledger = new ActionLedger(runId);
    this.safety = new SafetyReview(runId);
  }

  async run(toolName: string, input: any, ctx: ToolExecutionContext) {
    const tool = toolRegistry.get(toolName);
    const executionId = `tx_${nanoid(8)}`;
    
    // 1. HARDENING: Policy Engine check
    if (featureFlag('policyEngine')) {
      const decision = this.policies.evaluate({
        runId: ctx.runId,
        cycleNumber: ctx.cycleNumber,
        role: ctx.role,
        teamId: ctx.teamId,
        actionClass: 'EXECUTE',
        targetKind: 'tool',
        targetRef: toolName,
        summary: `Executing tool ${toolName}`,
        metadata: input
      });

      if (!decision.allowed) {
        throw new Error(`Policy violation: ${decision.reasons.join(', ')}`);
      }

      // Propose to ledger
      const actionId = this.ledger.propose({
        cycleNumber: ctx.cycleNumber,
        role: ctx.role,
        teamId: ctx.teamId,
        actionClass: 'EXECUTE',
        targetKind: 'tool',
        targetRef: toolName,
        riskTier: decision.riskTier,
        summary: `Executing ${toolName}`,
        input,
        reversible: true, // simplified
        policySnapshot: decision
      });

      // 2. HARDENING: Safety Review for high/critical risk
      if (featureFlag('unsafeActionDetector') && (decision.riskTier === 'high' || decision.riskTier === 'critical')) {
        const review = await this.safety.review({
          cycleNumber: ctx.cycleNumber,
          actionId,
          toolExecutionId: executionId,
          actionClass: 'EXECUTE',
          targetRef: toolName,
          summary: `Executing high-risk tool ${toolName}`,
          metadata: input
        });

        if (review.blocked || review.requires_approval) {
           this.ledger.markPendingApproval(actionId, `app_${nanoid(8)}`);
           throw new Error(`Action blocked/held by safety review: ${review.findings.map(f => f.reason).join(', ')}`);
        }
      }

      this.ledger.markApproved(actionId);
      ctx.taskId = actionId; // link back
    }

    // 2. Budget/Limit check
    const count = this.policy.countCycleCalls({ ...ctx, toolName });
    if (count >= this.policy.getLimit({ role: ctx.role, toolName, teamId: ctx.teamId })) {
        throw new Error(`Tool limit reached for ${toolName} in this cycle.`);
    }

    console.log(chalk.gray(`[tool] ${ctx.role} executing ${toolName}...`));

    // 3. Execution
    const db = getDb();
    db.prepare(`
        INSERT INTO tool_executions (id, run_id, cycle_number, task_id, team_id, role, tool_name, capability_class, status, input_json, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, datetime('now'))
    `).run(executionId, ctx.runId, ctx.cycleNumber, ctx.taskId ?? null, ctx.teamId ?? null, ctx.role, tool.name, tool.capabilityClass, JSON.stringify(input));
    db.close();

    const start = Date.now();
    try {
      const result = await tool.execute(input, ctx);
      const duration = Date.now() - start;

      this.recordSuccess(executionId, result, duration);
      if (ctx.taskId) this.ledger.apply(ctx.taskId, { output: result });
      return { executionId, result };
    } catch (err) {
      const duration = Date.now() - start;
      this.recordFailure(executionId, String(err), duration);
      if (ctx.taskId) this.ledger.fail(ctx.taskId, String(err));
      throw err;
    }
  }

  private recordSuccess(id: string, result: any, duration: number) {
    const db = getDb();
    db.prepare(`
      UPDATE tool_executions
      SET status='completed', output_summary=?, duration_ms=?, cost_usd=?, source_count=?, finished_at=datetime('now')
      WHERE id=?
    `).run(result.summary, duration, result.costUsd ?? 0, result.sources?.length ?? 0, id);

    if (result.sources) {
      const stmt = db.prepare(`
        INSERT INTO tool_artifacts (id, execution_id, artifact_type, source_uri, title, excerpt, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const src of result.sources) {
        stmt.run(`art_${nanoid(8)}`, id, src.type, src.uri ?? null, src.title ?? null, src.excerpt ?? null, JSON.stringify(src.metadata ?? {}));
      }
    }
    db.close();
  }

  private recordFailure(id: string, error: string, duration: number) {
    const db = getDb();
    db.prepare(`
      UPDATE tool_executions
      SET status='failed', error_text=?, duration_ms=?, finished_at=datetime('now')
      WHERE id=?
    `).run(error.slice(0, 1000), duration, id);
    db.close();
  }

  private logExecution(id: string, toolName: string, input: any, status: string, ctx: ToolExecutionContext, opts: { error?: string } = {}) {
      const db = getDb();
      db.prepare(`
          INSERT INTO tool_executions (id, run_id, cycle_number, task_id, team_id, role, tool_name, capability_class, status, input_json, error_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?)
      `).run(id, ctx.runId, ctx.cycleNumber, ctx.taskId ?? null, ctx.teamId ?? null, ctx.role, toolName, status, JSON.stringify(input), opts.error ?? null);
      db.close();
  }
}
