TypeScript

import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { VERIFICATION_AUDITOR_SYSTEM_PROMPT, VerificationReportSchema } from '@/prompts/verification-auditor.js';

export class VerificationAuditor {
  constructor(private runId: string) {}

  async audit(opts: {
    cycleNumber: number;
    role: string;
    draft: string;
    taskId?: string;
    evidencePackId?: string;
  }) {
    const db = getDb();
    const pack = opts.evidencePackId
      ? db.prepare(`SELECT artifact_path FROM evidence_packs WHERE id = ?`).get(opts.evidencePackId) as
          | { artifact_path: string }
          | undefined
      : undefined;
    db.close();

    const evidenceText = pack?.artifact_path
      ? await Bun.file(pack.artifact_path).text().catch(() => '')
      : '';

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const report = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: VERIFICATION_AUDITOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            draft: opts.draft,
            evidencePack: evidenceText.slice(0, 14000),
          }),
        },
      ],
      schema: VerificationReportSchema,
    });

    const db2 = getDb();
    db2.prepare(`
      INSERT INTO verification_reports
      (id, run_id, cycle_number, role, task_id, evidence_pack_id, total_claims, supported_claims, unsupported_claims, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `vr_${nanoid(8)}`,
      this.runId,
      opts.cycleNumber,
      opts.role,
      opts.taskId ?? null,
      opts.evidencePackId ?? null,
      report.total_claims,
      report.supported_claims,
      report.unsupported_claims,
      JSON.stringify(report),
    );
    db2.close();

    return report;
  }
}
Patch src/runtime/scorer.ts
Add:

TypeScript

function applyVerificationClamp(baseGroundedness: number, verification?: {
  total_claims: number;
  unsupported_claims: number;
}) {
  if (!verification || verification.total_claims <= 0) return baseGroundedness;
  const unsupportedRatio = verification.unsupported_claims / verification.total_claims;
  const penalty = Math.min(0.5, unsupportedRatio * 0.75);
  return Math.max(0, baseGroundedness - penalty);
}
Then when composing score:

TypeScript

const clampedGroundedness = applyVerificationClamp(groundedness, verificationReport);

const composite =
  0.30 * clampedGroundedness +
  0.25 * novelty +
  0.25 * consistency +
  0.20 * missionAlignment;
So Phase 6 does not change the constitution text; it changes how groundedness is operationalized when evidence exists.

17. Critic integration
Patch the Critic runtime call
Wherever you invoke Critic, append:

TypeScript

import { TOOL_AWARE_CRITIC_APPENDIX } from '@/prompts/tool-aware-critic.js';

const criticPrompt = [
  baseCriticPrompt,
  '',
  featureFlag('toolAwareCritic') ? TOOL_AWARE_CRITIC_APPENDIX : '',
  '',
  evidencePackId ? `Evidence pack ID: ${evidencePackId}` : 'No evidence pack attached.',
].join('\n');
This makes Critic explicitly ask:

what was not verified,
what claims are unsupported,
which next tool calls reduce uncertainty.
18. Orchestrator integration
Patch src/runtime/orchestrator.ts
Add imports:

TypeScript

import { bootstrapRegistry } from '@/tools/bootstrap.js';
import { ToolPolicy } from '@/tools/tool-policy.js';
import { EvidencePackBuilder } from '@/tools/evidence-pack.js';
import { VerificationAuditor } from '@/runtime/verification-auditor.js';
After run init:

TypeScript

const registry = bootstrapRegistry();
const toolPolicy = new ToolPolicy(runId);
const evidencePacks = new EvidencePackBuilder(runId);
const verifier = new VerificationAuditor(runId);

toolPolicy.seedDefaults();
After team creation in hierarchical mode:

TypeScript

for (const team of coordinator.listTeams?.() ?? []) {
  toolPolicy.seedDefaults(team.id);
}
When running workers, replace direct runner calls with runWithTools(...).

Example:

TypeScript

const engineerOut = await AgentRunner.runWithTools({
  runId,
  cycle: cycleNumber,
  role: 'Engineer',
  teamId: researchTeamId,
  taskId: engineerTaskId,
  task: engineerInstruction,
  prompt: engineerPrompt,
  model: config.models.engineer,
  memoryContext,
  graphContext,
  workspaceContext,
});
After collecting worker outputs, merge evidence packs for CEO synthesis:

TypeScript

const workerPackIds = [engineerOut, criticOut, archivistOut, devilOut]
  .map(x => x.evidencePackId)
  .filter(Boolean) as string[];

let mergedPackId: string | undefined;
if (workerPackIds.length > 0) {
  const merged = await evidencePacks.merge({
    cycleNumber,
    ownerRole: 'CEO',
    packIds: workerPackIds,
    summary: `Merged worker evidence for cycle ${cycleNumber}`,
  });
  mergedPackId = merged.packId;
}
Then CEO synthesis also uses runWithTools(...) or a plain synthesis path with merged evidence.

After final draft is produced:

TypeScript

const verificationReport = await verifier.audit({
  cycleNumber,
  role: 'CEO',
  draft: finalOutputText,
  evidencePackId: mergedPackId,
});
Pass this into scoring/judge:

TypeScript

const score = await ratchet.score({
  proposal,
  graph,
  verificationReport,
  evidencePackId: mergedPackId,
  toolStats: {
    toolCalls: [...engineerOut.toolExecutionIds, ...criticOut.toolExecutionIds].length,
  },
});
19. Ratchet Judge integration
Patch src/runtime/ratchet.ts
Change score input:

TypeScript

async score(input: {
  proposal: Proposal;
  graph: KnowledgeGraph;
  verificationReport?: {
    total_claims: number;
    supported_claims: number;
    unsupported_claims: number;
    unsupported_examples?: string[];
  };
  evidencePackId?: string;
  toolStats?: {
    toolCalls: number;
  };
}): Promise<RatchetScore> {
  const judgeOutput = await AgentRunner.run('RatchetJudge', {
    proposal: input.proposal,
    constitution: this.constitution,
    graph: input.graph,
    verificationReport: input.verificationReport,
    evidencePackId: input.evidencePackId,
    toolStats: input.toolStats,
    model: 'claude-opus-4',
  });
  return judgeOutput as RatchetScore;
}
Optional RatchetJudge appendix
Add to roles/RatchetJudge.md:

Markdown

## PHASE 6 TOOL-AWARE JUDGING ADDENDUM
- If verification report shows unsupported claims, reduce groundedness accordingly.
- If a worker made factual assertions without using obviously available tools, treat that as a process defect.
- Prefer modest verified output over bold unsupported output.
- Reward outputs whose evidence pack materially supports the final answer.
20. API routes