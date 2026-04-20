TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { RiskEngine, type RiskTier } from '@/runtime/risk-engine.js';

export type ActionClass = 'READ' | 'PROPOSE' | 'PATCH' | 'EXECUTE' | 'PUBLISH';

export interface ActionIntent {
  runId: string;
  cycleNumber: number;
  role: string;
  teamId?: string;
  actionClass: ActionClass;
  targetKind: 'tool' | 'file' | 'git' | 'api' | 'output';
  targetRef: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  requireApproval: boolean;
  requireReversible: boolean;
  requireProvenance: boolean;
  requireSignature: boolean;
  riskTier: RiskTier;
  matchedRule?: string;
  reasons: string[];
}

export class PolicyEngine {
  private risks = new RiskEngine();

  constructor(private runId: string) {}

  seedDefaults(teamId?: string) {
    const defaults = [
      // READ
      ['CEO', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['CoordinatorLead', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['Engineer', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['Critic', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['Archivist', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['DevilsAdvocate', 'READ', '*', 'low', 1, 0, 0, 1, 1],
      ['RatchetJudge', 'READ', '*', 'low', 1, 0, 0, 1, 1],

      // PROPOSE
      ['CEO', 'PROPOSE', '*', 'low', 1, 0, 0, 1, 1],
      ['CoordinatorLead', 'PROPOSE', '*', 'low', 1, 0, 0, 1, 1],
      ['Engineer', 'PROPOSE', '*', 'low', 1, 0, 0, 1, 1],
      ['Critic', 'PROPOSE', '*', 'low', 1, 0, 0, 1, 1],

      // PATCH
      ['Engineer', 'PATCH', '*', 'medium', 1, 1, 1, 1, 1],
      ['CoordinatorLead', 'PATCH', '*', 'medium', 1, 1, 1, 1, 1],
      ['CEO', 'PATCH', '*', 'medium', 1, 1, 1, 1, 1],

      // EXECUTE
      ['Engineer', 'EXECUTE', 'sandbox.exec', 'medium', 1, 0, 1, 1, 1],
      ['CoordinatorLead', 'EXECUTE', '*', 'high', 1, 1, 1, 1, 1],
      ['CEO', 'EXECUTE', '*', 'high', 1, 1, 1, 1, 1],
      ['Critic', 'EXECUTE', '*', 'high', 0, 1, 1, 1, 1],

      // PUBLISH
      ['CEO', 'PUBLISH', '*', 'high', 1, 1, 1, 1, 1],
      ['CoordinatorLead', 'PUBLISH', '*', 'high', 1, 1, 1, 1, 1],
      ['Engineer', 'PUBLISH', '*', 'high', 0, 1, 1, 1, 1],
    ] as const;

    const db = getDb();
    for (const [role, actionClass, targetSelector, riskTier, allowed, requireApproval, requireReversible, requireProvenance, requireSignature] of defaults) {
      db.prepare(`
        INSERT OR IGNORE INTO action_policies
        (id, run_id, team_id, role, action_class, target_selector, risk_tier, allowed,
         require_approval, require_reversible, require_provenance, require_signature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `pol_${nanoid(8)}`,
        this.runId,
        teamId ?? null,
        role,
        actionClass,
        targetSelector,
        riskTier,
        allowed,
        requireApproval,
        requireReversible,
        requireProvenance,
        requireSignature
      );
    }
    db.close();
  }

  evaluate(intent: ActionIntent): PolicyDecision {
    const inferredRisk = this.risks.classify(intent);

    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM action_policies
      WHERE run_id = ?
        AND role = ?
        AND action_class = ?
        AND (team_id = ? OR team_id IS NULL)
      ORDER BY CASE WHEN team_id IS NULL THEN 1 ELSE 0 END, updated_at DESC
    `).all(
      this.runId,
      intent.role,
      intent.actionClass,
      intent.teamId ?? null,
    ) as Array<{
      id: string;
      target_selector: string;
      risk_tier: RiskTier;
      allowed: number;
      require_approval: number;
      require_reversible: number;
      require_provenance: number;
      require_signature: number;
    }>;
    db.close();

    const rule = rows.find(row =>
      row.target_selector === '*' ||
      row.target_selector === intent.targetRef ||
      intent.targetRef.startsWith(row.target_selector.replace(/\*$/, ''))
    );

    if (!rule) {
      return {
        allowed: false,
        requireApproval: true,
        requireReversible: false,
        requireProvenance: true,
        requireSignature: true,
        riskTier: inferredRisk,
        reasons: [`No matching policy for ${intent.role}/${intent.actionClass}/${intent.targetRef}`],
      };
    }

    const rank: Record<RiskTier, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const requiresEscalation = rank[inferredRisk] > rank[rule.risk_tier];

    return {
      allowed: !!rule.allowed,
      requireApproval: !!rule.require_approval || requiresEscalation || inferredRisk === 'critical',
      requireReversible: !!rule.require_reversible,
      requireProvenance: !!rule.require_provenance,
      requireSignature: !!rule.require_signature,
      riskTier: inferredRisk,
      matchedRule: rule.id,
      reasons: requiresEscalation
        ? [`Risk escalated from ${rule.risk_tier} to ${inferredRisk}`]
        : [`Matched policy ${rule.id}`],
    };
  }
}
3. Risk engine