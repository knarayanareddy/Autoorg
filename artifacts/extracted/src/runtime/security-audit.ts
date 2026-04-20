TypeScript

import { nanoid } from 'nanoid';
import { mkdir } from 'node:fs/promises';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { ArtifactSigner } from '@/runtime/artifact-signing.js';

export class SecurityAudit {
  private artifacts = new ImmutableArtifacts();
  private signer = new ArtifactSigner();

  constructor(private runId: string) {}

  recordFinding(opts: {
    cycleNumber?: number;
    severity: 'info' | 'warn' | 'error' | 'critical';
    category: 'policy_violation' | 'secret_exposure' | 'pii_exposure' | 'sandbox_escape_attempt' | 'unsafe_execute' | 'unsafe_publish' | 'provenance_gap' | 'approval_gap' | 'artifact_tamper';
    actionId?: string;
    toolExecutionId?: string;
    summary: string;
    details?: Record<string, unknown>;
  }) {
    const db = getDb();
    db.prepare(`
      INSERT INTO security_findings
      (id, run_id, cycle_number, severity, category, action_id, tool_execution_id, summary, details_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(
      `sf_${nanoid(10)}`,
      this.runId,
      opts.cycleNumber ?? null,
      opts.severity,
      opts.category,
      opts.actionId ?? null,
      opts.toolExecutionId ?? null,
      opts.summary,
      JSON.stringify(opts.details ?? {})
    );
    db.close();
  }

  async exportBundle(format: 'json' | 'markdown' = 'json') {
    const db = getDb();

    const findings = db.prepare(`SELECT * FROM security_findings WHERE run_id = ? ORDER BY created_at DESC`).all(this.runId);
    const redactions = db.prepare(`SELECT * FROM redaction_events WHERE run_id = ? ORDER BY created_at DESC`).all(this.runId);
    const actions = db.prepare(`SELECT * FROM action_ledger WHERE run_id = ? ORDER BY created_at ASC`).all(this.runId);
    const policies = db.prepare(`SELECT * FROM policy_reports WHERE run_id = ? ORDER BY created_at DESC`).all(this.runId);
    const provenance = db.prepare(`SELECT * FROM provenance_reports WHERE run_id = ? ORDER BY created_at DESC`).all(this.runId);
    db.close();

    await mkdir('artifacts/security/audits', { recursive: true });

    if (format === 'json') {
      const payload = {
        runId: this.runId,
        exportedAt: new Date().toISOString(),
        findings,
        redactions,
        actions,
        policies,
        provenance,
      };

      const relPath = `artifacts/security/audits/${this.runId}.audit.json`;
      const { artifactPath, sha256 } = await this.artifacts.writeJson({
        runId: this.runId,
        relPath,
        data: payload,
        artifactKind: 'security_audit',
      });

      const db2 = getDb();
      db2.prepare(`
        INSERT INTO security_exports
        (id, run_id, export_format, artifact_path, sha256)
        VALUES (?, ?, 'json', ?, ?)
      `).run(`sex_${nanoid(10)}`, this.runId, artifactPath, sha256);
      db2.close();

      return { artifactPath, sha256 };
    }

    const markdown = [
      `# Security Audit — ${this.runId}`,
      ``,
      `Exported: ${new Date().toISOString()}`,
      ``,
      `## Findings`,
      ...findings.map((f: any) => `- [${f.severity}] ${f.category}: ${f.summary}`),
      ``,
      `## Redactions`,
      ...redactions.map((r: any) => `- ${r.detector}/${r.finding_type} in ${r.channel}`),
      ``,
      `## Policy Reports`,
      ...policies.map((p: any) => `- cycle ${p.cycle_number}: score=${p.score}`),
    ].join('\n');

    const relPath = `artifacts/security/audits/${this.runId}.audit.md`;
    const { artifactPath, sha256 } = await this.artifacts.writeText({
      runId: this.runId,
      relPath,
      text: markdown,
      artifactKind: 'security_audit',
      mimeType: 'text/markdown',
    });

    const db3 = getDb();
    db3.prepare(`
      INSERT INTO security_exports
      (id, run_id, export_format, artifact_path, sha256)
      VALUES (?, ?, 'markdown', ?, ?)
    `).run(`sex_${nanoid(10)}`, this.runId, artifactPath, sha256);
    db3.close();

    return { artifactPath, sha256 };
  }

  async verifyArtifactOrRaise(artifactPath: string, cycleNumber?: number) {
    const verified = await this.signer.verifyFile(artifactPath);
    if (!verified.ok) {
      this.recordFinding({
        cycleNumber,
        severity: 'error',
        category: 'artifact_tamper',
        summary: `Artifact verification failed for ${artifactPath}`,
        details: verified,
      });
    }
    return verified;
  }
}
15. ToolRunner hardening integration
Patch src/tools/tool-runner.ts
Add imports:

TypeScript

import { ApprovalGate } from '@/runtime/approval-gate.js';
import { PolicyEngine } from '@/runtime/policy-engine.js';
import { ActionLedger } from '@/runtime/action-ledger.js';
import { RedactionFilter } from '@/runtime/redaction.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { SafetyReview } from '@/runtime/safety-review.js';
import { SecurityAudit } from '@/runtime/security-audit.js';
import { featureFlag } from '@/config/feature-flags.js';
Add helpers:

TypeScript

function actionClassForCapability(cap: 'search' | 'read' | 'verify' | 'execute' | 'transform') {
  if (cap === 'execute') return 'EXECUTE';
  if (cap === 'transform') return 'PROPOSE';
  return 'READ';
}
Inside constructor add:

TypeScript

private approvals = new ApprovalGate();
private policy = new PolicyEngine(this.runId);
private ledger = new ActionLedger(this.runId);
private redactor = new RedactionFilter(this.runId);
private artifacts = new ImmutableArtifacts();
private safety = new SafetyReview(this.runId);
private security = new SecurityAudit(this.runId);
At the start of execute(...), before actual tool execution:

TypeScript

const actionClass = actionClassForCapability(tool.capabilityClass);
const decision = this.policy.evaluate({
  runId: this.runId,
  cycleNumber: ctx.cycleNumber,
  role: ctx.role,
  teamId: ctx.teamId,
  actionClass,
  targetKind: 'tool',
  targetRef: toolName,
  summary: `Tool execution requested: ${toolName}`,
  metadata: { input },
});

const actionId = this.ledger.propose({
  cycleNumber: ctx.cycleNumber,
  role: ctx.role,
  teamId: ctx.teamId,
  actionClass,
  targetKind: 'tool',
  targetRef: toolName,
  riskTier: decision.riskTier,
  summary: `Tool execution requested: ${toolName}`,
  input,
  reversible: false,
  policySnapshot: decision,
});

if (!decision.allowed) {
  this.ledger.deny(actionId, decision.reasons.join('; '));
  this.security.recordFinding({
    cycleNumber: ctx.cycleNumber,
    severity: 'warn',
    category: 'policy_violation',
    actionId,
    summary: `Denied tool execution ${toolName}`,
    details: { reasons: decision.reasons, role: ctx.role },
  });
  return await this.denied(toolName, input, ctx, `Policy denied ${toolName}`);
}

if (featureFlag('unsafeActionDetector') && actionClass === 'EXECUTE') {
  const review = await this.safety.review({
    cycleNumber: ctx.cycleNumber,
    actionId,
    actionClass: 'EXECUTE',
    targetRef: toolName,
    summary: `Execute tool ${toolName}`,
    metadata: input as Record<string, unknown>,
  });

  if (review.blocked) {
    this.ledger.deny(actionId, review.safe_alternative);
    return {
      executionId: `blocked_${actionId}`,
      summary: review.safe_alternative,
      output: { blocked: true, review },
      sources: [],
    };
  }

  if (review.requires_approval || decision.requireApproval) {
    const approvalId = this.approvals.request({
      runId: this.runId,
      cycleNumber: ctx.cycleNumber,
      approvalType: 'execute',
      subject: actionId,
      requestedBy: ctx.role,
      summary: `Execution approval required for ${toolName}`,
      details: { input, review, decision },
    });
    this.ledger.markPendingApproval(actionId, approvalId);
    return {
      executionId: `pending_${actionId}`,
      summary: `Execution pending approval ${approvalId}`,
      output: { pendingApproval: true, approvalId },
      sources: [],
    };
  }
}
Then after successful tool execution, redact and sign before persistence:

TypeScript

const sanitizedSummary = this.redactor.redact(result.summary, {
  cycleNumber: ctx.cycleNumber,
  channel: 'output',
}).text;

const sanitizedSources = (result.sources ?? []).map(src => ({
  ...src,
  excerpt: src.excerpt
    ? this.redactor.redact(src.excerpt, {
        cycleNumber: ctx.cycleNumber,
        channel: 'artifact',
      }).text
    : src.excerpt,
}));

const payload = {
  toolName,
  input: parsed,
  result: {
    ...result,
    summary: sanitizedSummary,
    sources: sanitizedSources,
  },
  ctx,
};

const artifact = await this.artifacts.writeJson({
  runId: this.runId,
  relPath: `artifacts/tools/outputs/${id}.json`,
  data: payload,
  artifactKind: 'tool_execution',
  actionId,
});
Replace the old writeFile/artifactPath block with the signed artifact result and set ledger applied:

TypeScript

this.ledger.apply(actionId, {
  output: {
    summary: sanitizedSummary,
    sourceCount: sanitizedSources.length,
  },
  artifactPath: artifact.artifactPath,
});
Also when inserting tool_artifacts, preserve source metadata:

TypeScript

JSON.stringify(src.metadata ?? {})
and use sanitizedSources instead of result.sources.

If tool execution fails:

TypeScript

this.ledger.fail(actionId, error instanceof Error ? error.message : String(error));
16. Evidence pack hardening
Patch src/tools/evidence-pack.ts
Add imports:

TypeScript

import { RedactionFilter } from '@/runtime/redaction.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
Inside class:

TypeScript

private redactor = new RedactionFilter(this.runId);
private artifacts = new ImmutableArtifacts();
Change the SQL query in fromExecutions(...) to also pull source metadata:

TypeScript

SELECT te.id, te.tool_name, te.output_summary, ta.source_uri, ta.title, ta.excerpt, ta.metadata_json
FROM tool_executions te
LEFT JOIN tool_artifacts ta ON ta.execution_id = te.id
...
When building markdown, sanitize excerpts:

TypeScript

const safeExcerpt = this.redactor.redact((row.excerpt ?? '').slice(0, 900), {
  channel: 'artifact',
}).text;
When writing the pack, use immutable artifact writer:

TypeScript

const written = await this.artifacts.writeText({
  runId: this.runId,
  relPath: `artifacts/evidence/packs/${packId}.md`,
  text: markdown,
  artifactKind: 'evidence_pack',
  mimeType: 'text/markdown',
});
const artifactPath = written.artifactPath;
When inserting evidence_items, preserve upstream provenance metadata:

TypeScript

const upstreamMeta = JSON.parse(row.metadata_json || '{}');

db.prepare(`
  INSERT INTO evidence_items
  (id, pack_id, execution_id, source_uri, title, excerpt, confidence, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  `ei_${nanoid(8)}`,
  packId,
  row.id,
  row.source_uri ?? null,
  row.title ?? null,
  safeExcerpt,
  0.75,
  JSON.stringify({
    evidenceLabel: `ev_${i + 1}`,
    toolName: row.tool_name,
    graphNodeRef: upstreamMeta.graphNodeRef ?? null,
    sourceChunkRef: upstreamMeta.sourceChunkRef ?? null,
    seedMaterialRef: upstreamMeta.seedMaterialRef ?? row.source_uri ?? null,
  }),
);
This is the point where evidence items stop being just “citations” and become actual provenance anchors.

17. Transcript and memory redaction
Patch transcript writer
Before writing transcript events:

TypeScript

import { RedactionFilter } from '@/runtime/redaction.js';

const redactor = new RedactionFilter(runId);

function sanitizeTranscriptContent(text: string, cycleNumber?: number) {
  return redactor.redact(text, {
    cycleNumber,
    channel: 'transcript',
  }).text;
}
For each transcript event payload string field:

TypeScript

content: sanitizeTranscriptContent(content, cycleNumber)
Patch memory manager
Before appending to memory/MEMORY.md or team partition memory:

TypeScript

import { RedactionFilter } from '@/runtime/redaction.js';

const redactor = new RedactionFilter(runId);
const safeText = redactor.redact(textToPersist, {
  cycleNumber,
  channel: 'memory',
  artifactPath: targetPath,
}).text;
Then write safeText instead of raw text.

18. ApprovalEnforcer hardening
Patch src/runtime/approval-enforcer.ts
Add imports:

TypeScript

import { PolicyEngine } from '@/runtime/policy-engine.js';
import { ActionLedger } from '@/runtime/action-ledger.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { SafetyReview } from '@/runtime/safety-review.js';
import { SecurityAudit } from '@/runtime/security-audit.js';
Inside class:

TypeScript

private policy = new PolicyEngine(this.runId);
private ledger = new ActionLedger(this.runId);
private artifacts = new ImmutableArtifacts();
private safety = new SafetyReview(this.runId);
private security = new SecurityAudit(this.runId);
In stageCommitCandidate(...), before creating the approval:

TypeScript

const decision = this.policy.evaluate({
  runId: this.runId,
  cycleNumber: opts.cycleNumber,
  role: 'CEO',
  actionClass: 'PUBLISH',
  targetKind: 'git',
  targetRef: 'git.commit',
  summary: `Materialize commit candidate for cycle ${opts.cycleNumber}`,
  metadata: { targetFile: opts.targetFile, score: opts.score },
});

const actionId = this.ledger.propose({
  cycleNumber: opts.cycleNumber,
  role: 'CEO',
  actionClass: 'PUBLISH',
  targetKind: 'git',
  targetRef: 'git.commit',
  riskTier: decision.riskTier,
  summary: `Materialize commit candidate for cycle ${opts.cycleNumber}`,
  input: { score: opts.score, targetFile: opts.targetFile },
  reversible: true,
  compensationAction: { type: 'git_revert_last_commit' },
  policySnapshot: decision,
});

if (!decision.allowed) {
  this.ledger.deny(actionId, 'Publish policy denied commit materialization');
  throw new Error('Commit candidate denied by publish policy');
}

const review = await this.safety.review({
  cycleNumber: opts.cycleNumber,
  actionId,
  actionClass: 'PUBLISH',
  targetRef: 'git.commit',
  summary: opts.summary,
  metadata: { score: opts.score },
});

if (review.blocked) {
  this.ledger.deny(actionId, review.safe_alternative);
  this.security.recordFinding({
    cycleNumber: opts.cycleNumber,
    severity: 'error',
    category: 'unsafe_publish',
    actionId,
    summary: 'Blocked unsafe commit materialization',
    details: review,
  });
  throw new Error(review.safe_alternative);
}
Replace raw pending snapshot write with immutable signed artifact:

TypeScript

const pendingArtifact = await this.artifacts.writeText({
  runId: this.runId,
  relPath: `artifacts/approvals/pending/${actionId}.current_output.md`,
  text: opts.outputText,
  artifactKind: 'pending_publish_candidate',
  mimeType: 'text/markdown',
  actionId,
});
const snapshotPath = pendingArtifact.artifactPath;
After approvalId is created:

TypeScript

this.ledger.markPendingApproval(actionId, approvalId);
In materializeApprovedActions(), before writing content back into workspace:

TypeScript

const verified = await this.security.verifyArtifactOrRaise(row.artifact_path);
if (!verified.ok) {
  throw new Error(`Artifact verification failed for ${row.id}`);
}
After successful commit:

TypeScript

this.ledger.markApproved(row.id, row.approval_id);
this.ledger.apply(row.id, {
  output: { committed: true, commitMessage: row.commit_message },
  artifactPath: row.artifact_path,
});
If materialization fails:

TypeScript

this.ledger.fail(row.id, error instanceof Error ? error.message : String(error));
19. Risk-tiered approvals
Add a small helper in src/runtime/policy-engine.ts
TypeScript

export function requiredApprovalLevel(riskTier: RiskTier) {
  switch (riskTier) {
    case 'critical': return 'owner';
    case 'high': return 'maintainer';
    case 'medium': return 'reviewer';
    default: return 'none';
  }
}
Use it when requesting approvals
In dangerous execution or publish paths:

TypeScript

import { requiredApprovalLevel } from '@/runtime/policy-engine.js';

const approvalLevel = requiredApprovalLevel(decision.riskTier);

const approvalId = approvalGate.request({
  runId,
  cycleNumber,
  approvalType: 'publish',
  subject: actionId,
  requestedBy: ctx.role,
  summary: `Risk=${decision.riskTier}; approval level=${approvalLevel}`,
  details: {
    actionId,
    decision,
    approvalLevel,
  },
});
This gives you a path later to enforce:

reviewer for medium
maintainer for high
owner for critical
Even if the UI doesn’t yet have multi-level approver identity logic, the ledger and approval request now carry the escalation level.

20. AgentRunner policy/provenance integration
Patch src/runtime/agent-runner.ts
Add imports:

TypeScript

import { ActionLedger } from '@/runtime/action-ledger.js';
import { PolicyEngine } from '@/runtime/policy-engine.js';
At the start of runWithTools(...), record the agent’s synthesis itself as a PROPOSE action:

TypeScript

const policy = new PolicyEngine(ctx.runId);
const ledger = new ActionLedger(ctx.runId);

const proposeDecision = policy.evaluate({
  runId: ctx.runId,
  cycleNumber: ctx.cycle,
  role: ctx.role,
  teamId: ctx.teamId,
  actionClass: 'PROPOSE',
  targetKind: 'output',
  targetRef: `draft:${ctx.role}`,
  summary: `Draft synthesis by ${ctx.role}`,
});

const proposeActionId = ledger.propose({
  cycleNumber: ctx.cycle,
  role: ctx.role,
  teamId: ctx.teamId,
  actionClass: 'PROPOSE',
  targetKind: 'output',
  targetRef: `draft:${ctx.role}`,
  riskTier: proposeDecision.riskTier,
  summary: `Draft synthesis by ${ctx.role}`,
  input: { task: ctx.task },
  reversible: false,
  policySnapshot: proposeDecision,
});
After synthesis succeeds:

TypeScript

ledger.apply(proposeActionId, {
  output: {
    evidencePackId,
    toolExecutionIds: executionIds,
  },
});
If synthesis fails:

TypeScript

ledger.fail(proposeActionId, error instanceof Error ? error.message : String(error));
This gives you full policy coverage across:

tool use,
execution,
publication,
plain draft synthesis.
21. Provenance + policy audit in orchestrator
Patch src/runtime/orchestrator.ts
Add imports:

TypeScript

import { RunManifestWriter } from '@/runtime/run-manifest.js';
import { ProvenanceBuilder } from '@/runtime/provenance.js';
import { PolicyAuditor } from '@/runtime/policy-auditor.js';
import { PolicyEngine } from '@/runtime/policy-engine.js';
After run initialization:

TypeScript

const manifestWriter = new RunManifestWriter();
const provenance = new ProvenanceBuilder(runId);
const policyAuditor = new PolicyAuditor(runId);
const policyEngine = new PolicyEngine(runId);

policyEngine.seedDefaults();
await manifestWriter.write(runId, {
  mission: config.mission,
  models: config.models,
  enabledFlags: config.featureFlags ?? {},
});
After team creation:

TypeScript

for (const team of coordinator.listTeams?.() ?? []) {
  policyEngine.seedDefaults(team.id);
}
After final draft / CEO output is produced and after verification audit:

TypeScript

const provenanceReport = await provenance.linkDraft({
  cycleNumber,
  role: 'CEO',
  draft: finalOutputText,
  evidencePackId: mergedPackId,
});

const policyReport = await policyAuditor.audit({
  cycleNumber,
  role: 'CEO',
  draft: finalOutputText,
  verificationReport,
  provenanceReport,
});
Pass them into ratchet scoring:

TypeScript

const score = await ratchet.score({
  proposal,
  graph,
  verificationReport,
  evidencePackId: mergedPackId,
  toolStats: {
    toolCalls: allToolExecutionIds.length,
  },
  policyReport,
  provenanceReport,
});
22. Judge-side policy compliance score
Patch src/runtime/scorer.ts
Add helper:

TypeScript

function applyPolicyComplianceClamp(baseComposite: number, policyCompliance?: number) {
  if (typeof policyCompliance !== 'number') return baseComposite;
  const penalty = Math.max(0, 0.35 * (1 - policyCompliance));
  return Math.max(0, baseComposite - penalty);
}
When composing score:

TypeScript

const baseComposite =
  0.30 * clampedGroundedness +
  0.25 * novelty +
  0.25 * consistency +
  0.20 * missionAlignment;

const policyCompliance = policyReport?.score ?? 1;
const composite = applyPolicyComplianceClamp(baseComposite, policyCompliance);
Return it as part of the score object:

TypeScript

return {
  composite,
  groundedness: clampedGroundedness,
  novelty,
  consistency,
  missionAlignment,
  policyCompliance,
  justification,
};
Patch roles/RatchetJudge.md
Add:

Markdown

## PHASE 6.1 POLICY-AWARE JUDGING ADDENDUM
- Review the policy report and provenance report alongside the proposal.
- Unsupported publication, approval bypass, secret leakage, or broken provenance reduce confidence substantially.
- Reward outputs that are not only good, but attributable, policy-compliant, and reversible.
- Prefer a slightly less ambitious output with clean provenance over an ambitious but weakly governed one.
23. Unsafe-action detector in Critic
Patch Critic prompt / runtime
Add prompt appendix:

TypeScript

export const UNSAFE_ACTION_CRITIC_APPENDIX = `
ADDITIONAL PHASE 6.1 DUTIES:
- Identify any proposed patch, execution, or publish action that violates policy.
- Flag claims that should not be published because provenance is incomplete.
- Flag command patterns that look destructive, permission-escalating, or exfiltration-prone.
- Recommend whether the action should be blocked, approved, or downgraded to proposal-only.
`.trim();
Then append it in Critic runtime the same way you appended the tool-aware critic appendix in Phase 6.

24. Results logger patch
If your results.tsv logger has fixed columns, add policyCompliance and provenanceLinkedClaims.

Patch src/runtime/results-logger.ts
Add columns:

TypeScript

const HEADERS = [
  'cycle',
  'score',
  'groundedness',
  'novelty',
  'consistency',
  'missionAlignment',
  'policyCompliance',
  'decision',
  'summary',
];
When appending:

TypeScript

policyCompliance: typeof row.policyCompliance === 'number'
  ? row.policyCompliance.toFixed(4)
  : '',
Now the ratchet history reflects not just quality, but governance quality.

25. API routes for security + provenance