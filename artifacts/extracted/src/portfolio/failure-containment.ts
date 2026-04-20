TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class FailureContainment {
  constructor(private portfolioRunId: string) {}

  record(opts: {
    variantId?: string;
    severity: 'info' | 'warn' | 'error' | 'critical';
    category: 'budget_exhausted' | 'security_findings' | 'workspace_corruption' | 'crash_loop' | 'quarantined' | 'killed' | 'approval_bypass_attempt';
    summary: string;
    details?: Record<string, unknown>;
  }) {
    const db = getDb();
    db.prepare(`
      INSERT INTO failure_containment_events
      (id, portfolio_run_id, variant_id, severity, category, summary, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `fce_${nanoid(10)}`,
      this.portfolioRunId,
      opts.variantId ?? null,
      opts.severity,
      opts.category,
      opts.summary,
      JSON.stringify(opts.details ?? {})
    );
    db.close();
  }

  quarantineVariant(variantId: string, reason: string) {
    const db = getDb();
    db.prepare(`
      UPDATE portfolio_variants
      SET status = 'quarantined', updated_at = datetime('now')
      WHERE id = ?
    `).run(variantId);
    db.close();

    this.record({
      variantId,
      severity: 'error',
      category: 'quarantined',
      summary: `Variant quarantined: ${reason}`,
    });
  }

  eliminateVariant(variantId: string, reason: string) {
    const db = getDb();
    db.prepare(`
      UPDATE portfolio_variants
      SET status = 'eliminated', updated_at = datetime('now')
      WHERE id = ?
    `).run(variantId);
    db.close();

    this.record({
      variantId,
      severity: 'warn',
      category: 'killed',
      summary: `Variant eliminated: ${reason}`,
    });
  }

  shouldKill(opts: {
    spentBudgetUsd: number;
    allocatedBudgetUsd: number;
    securityFindings: number;
    criticalPolicyFailure?: boolean;
  }) {
    if (opts.criticalPolicyFailure) return true;
    if (opts.securityFindings >= 3) return true;
    if (opts.spentBudgetUsd > opts.allocatedBudgetUsd) return true;
    return false;
  }
}
5. Portfolio priors from Phase 7 leaderboards
Phase 8 should not start from zero if Phase 7 already taught you that some templates or constitutions are consistently better.
