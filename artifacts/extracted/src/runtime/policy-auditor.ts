TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { POLICY_AUDITOR_SYSTEM_PROMPT, PolicyAuditSchema } from '@/prompts/policy-auditor.js';

export class PolicyAuditor {
  constructor(private runId: string) {}

  async audit(opts: {
    cycleNumber: number;
    role: string;
    draft: string;
    taskId?: string;
    verificationReport?: unknown;
    provenanceReport?: unknown;
  }) {
    const db = getDb();

    const findings = db.prepare(`
      SELECT severity, category, summary
      FROM security_findings
      WHERE run_id = ? AND (cycle_number = ? OR cycle_number IS NULL)
      ORDER BY created_at DESC
      LIMIT 50
    `).all(this.runId, opts.cycleNumber);

    const actions = db.prepare(`
      SELECT role, action_class, target_kind, target_ref, risk_tier, status, summary
      FROM action_ledger
      WHERE run_id = ? AND cycle_number = ?
      ORDER BY created_at ASC
      LIMIT 100
    `).all(this.runId, opts.cycleNumber);

    db.close();

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: POLICY_AUDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            draft: opts.draft,
            findings,
            actions,
            verificationReport: opts.verificationReport ?? {},
            provenanceReport: opts.provenanceReport ?? {},
          }, null, 2),
        },
      ],
      schema: PolicyAuditSchema,
    });

    const db2 = getDb();
    db2.prepare(`
      INSERT INTO policy_reports
      (id, run_id, cycle_number, role, task_id, score, approval_gaps, unsafe_action_count, violations_json, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `pa_${nanoid(10)}`,
      this.runId,
      opts.cycleNumber,
      opts.role,
      opts.taskId ?? null,
      report.score,
      report.approval_gaps,
      report.unsafe_action_count,
      JSON.stringify(report.violations),
      JSON.stringify(report),
    );
    db2.close();

    return report;
  }
}
14. Security findings + audit export