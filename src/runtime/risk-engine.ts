export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

const HIGH_RISK_PATHS = [
  '.env',
  '.env.local',
  'constitution.md',
  '.github/workflows/',
  'deploy/',
  'infra/',
  'secrets/',
];

const CRITICAL_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\bcurl\b.*\|\s*(bash|sh)\b/i,
  /\bwget\b.*\|\s*(bash|sh)\b/i,
  /\bchmod\s+777\b/i,
  /\bnpm\s+publish\b/i,
  /\bdocker\s+run\b/i,
  /\bkubectl\b/i,
];

export class RiskEngine {
  classify(intent: {
    actionClass: 'READ' | 'PROPOSE' | 'PATCH' | 'EXECUTE' | 'PUBLISH';
    targetRef: string;
    targetKind: string;
    metadata?: Record<string, unknown>;
  }): RiskTier {
    if (intent.actionClass === 'READ') return 'low';
    if (intent.actionClass === 'PROPOSE') return 'low';

    if (intent.actionClass === 'PATCH') {
      const target = intent.targetRef.toLowerCase();
      if (HIGH_RISK_PATHS.some(p => target.includes(p.toLowerCase()))) return 'high';
      return 'medium';
    }

    if (intent.actionClass === 'EXECUTE') {
      const cmd = String(intent.metadata?.command ?? intent.targetRef ?? '');
      if (CRITICAL_COMMAND_PATTERNS.some(rx => rx.test(cmd))) return 'critical';
      if (cmd.includes('git push') || cmd.includes('network') || cmd.includes('http')) return 'high';
      return 'medium';
    }

    if (intent.actionClass === 'PUBLISH') {
      const target = intent.targetRef.toLowerCase();
      if (target.includes('prod') || target.includes('public') || target.includes('push')) return 'critical';
      return 'high';
    }

    return 'medium';
  }
}
