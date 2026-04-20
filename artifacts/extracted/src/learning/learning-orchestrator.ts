TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { PatternMiner } from '@/learning/pattern-miner.js';
import { PromptOptimizer } from '@/learning/prompt-optimizer.js';
import { PolicyOptimizer } from '@/learning/policy-optimizer.js';
import { RoleEvolver } from '@/learning/role-evolver.js';
import { RoutingOptimizer } from '@/learning/routing-optimizer.js';
import { Simulator } from '@/learning/simulator.js';
import { DriftDetector } from '@/learning/drift-detector.js';
import { ReleaseGate } from '@/learning/release-gate.js';
import { MemoryUtilityScorer } from '@/learning/memory-utility.js';
import { MemoryPruner } from '@/learning/memory-pruner.js';
import { AdapterDistiller } from '@/learning/adapter-distiller.js';
import { VersionManager } from '@/learning/version-manager.js';

export class LearningOrchestrator {
  private miner = new PatternMiner();
  private promptOptimizer = new PromptOptimizer();
  private policyOptimizer = new PolicyOptimizer();
  private roleEvolver = new RoleEvolver();
  private routingOptimizer = new RoutingOptimizer();
  private simulator = new Simulator();
  private drift = new DriftDetector();
  private gate = new ReleaseGate();
  private memoryUtility = new MemoryUtilityScorer();
  private memoryPruner = new MemoryPruner();
  private distiller = new AdapterDistiller();
  private versions = new VersionManager();

  async run(opts?: {
    tenantId?: string;
    workspaceId?: string;
    suiteName?: string;
    runId?: string;
    cycleNumber?: number;
  }) {
    const db = getDb();
    const learningCycleId = `lc_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO learning_cycles
      (id, tenant_id, workspace_id, initiated_by, status, source_window_start, source_window_end, objective_json)
      VALUES (?, ?, ?, 'system', 'running', datetime('now', '-30 days'), datetime('now'), ?)
    `).run(
      learningCycleId,
      opts?.tenantId ?? null,
      opts?.workspaceId ?? null,
      JSON.stringify({
        suiteName: opts?.suiteName ?? 'core',
        objective: 'bounded self-improvement',
      })
    );
    db.close();

    try {
      const pattern = await this.miner.mine({
        learningCycleId,
        sourceScope: 'combined',
      });

      const created: Array<{ proposalId: string; versionId?: string; versionKind?: 'prompt' | 'policy' | 'role' | 'routing' }> = [];

      // 1) Prompt candidate for CEO
      const p1 = await this.promptOptimizer.optimize({
        learningCycleId,
        targetKey: 'role:CEO',
        basePromptPath: 'roles/CEO.md',
        patternReport: pattern.report,
      });
      created.push({ proposalId: p1.proposalId, versionId: p1.versionId, versionKind: 'prompt' });

      // 2) Prompt candidate for Critic
      const p2 = await this.promptOptimizer.optimize({
        learningCycleId,
        targetKey: 'role:Critic',
        basePromptPath: 'roles/Critic.md',
        patternReport: pattern.report,
      });
      created.push({ proposalId: p2.proposalId, versionId: p2.versionId, versionKind: 'prompt' });

      // 3) Routing candidate
      const p3 = await this.routingOptimizer.optimize(learningCycleId);
      created.push({ proposalId: p3.proposalId, versionId: p3.versionId, versionKind: 'routing' });

      // 4) Example policy candidate
      const p4 = await this.policyOptimizer.optimize({
        learningCycleId,
        targetKey: 'tool_policy',
        currentConfig: { maxCallsPerCycle: 4 },
        patternReport: pattern.report,
      });
      created.push({ proposalId: p4.proposalId, versionId: p4.versionId, versionKind: 'policy' });

      // 5) Example role candidate
      const p5 = await this.roleEvolver.evolve({
        learningCycleId,
        roleKey: 'Critic',
        currentManifest: {
          role_key: 'Critic',
          responsibilities: ['identify unsupported claims', 'attack weak reasoning'],
        },
        patternReport: pattern.report,
      });
      created.push({ proposalId: p5.proposalId, versionId: p5.versionId, versionKind: 'role' });

      // 6) Memory utility + prune recommendation
      await this.memoryUtility.scoreWorkspace(process.cwd());
      await this.memoryPruner.prune({
        workspaceRoot: process.cwd(),
        utilityThreshold: 0.18,
      });

      // 7) Distill a high-quality trace export
      await this.distiller.exportDataset({
        learningCycleId,
        jobKind: 'critic',
        minScore: 0.82,
        minPolicyCompliance: 0.97,
      });

      // Simulate and gate candidates
      for (const item of created) {
        if (!item.versionId || !item.versionKind) continue;

        const simulation = await this.simulator.simulate({
          proposalId: item.proposalId,
          suiteName: opts?.suiteName ?? 'core',
          candidateOverrides: {
            learningCandidate: {
              versionKind: item.versionKind,
              versionId: item.versionId,
            },
          },
        });

        let driftReport: any = null;

        if (item.versionKind === 'prompt') {
          const active = this.versions.getActivePrompt(item.versionId.startsWith('pv_') ? 'role:CEO' : 'role:Critic');
          const candidate = this.loadPromptCandidate(item.versionId);
          driftReport = await this.drift.compare({
            targetKey: active?.target_key ?? 'unknown',
            fromVersionId: active?.id,
            toVersionId: item.versionId,
            fromContent: active?.content ?? '',
            toContent: candidate ?? '',
          }).then(x => x.report);
        }

        await this.gate.evaluate({
          proposalId: item.proposalId,
          versionKind: item.versionKind,
          versionId: item.versionId,
          simulationDelta: simulation.delta,
          driftReport,
          runId: opts?.runId ?? `learning_${learningCycleId}`,
          cycleNumber: opts?.cycleNumber ?? 0,
        });
      }

      const db2 = getDb();
      db2.prepare(`
        UPDATE learning_cycles
        SET status = 'completed', finished_at = datetime('now'), summary_json = ?
        WHERE id = ?
      `).run(
        JSON.stringify({
          patternReportId: pattern.reportId,
          proposalCount: created.length,
        }),
        learningCycleId
      );
      db2.close();

      return { learningCycleId, proposalCount: created.length };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE learning_cycles
        SET status = 'failed', finished_at = datetime('now'), summary_json = ?
        WHERE id = ?
      `).run(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        learningCycleId
      );
      db3.close();
      throw error;
    }
  }

  private loadPromptCandidate(versionId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT content FROM prompt_versions WHERE id = ?
    `).get(versionId) as { content: string } | undefined;
    db.close();
    return row?.content ?? '';
  }
}
19. AgentRunner integration
Phase 10 only works if runtime prompt loading is version-aware.

Patch src/runtime/agent-runner.ts
Add imports:

TypeScript

import { VersionManager } from '@/learning/version-manager.js';
Before invoking the model:

TypeScript

const versions = new VersionManager();

function roleTargetKey(role: string) {
  return `role:${role}`;
}

let effectivePrompt = prompt;

const activePrompt = versions.getActivePrompt(roleTargetKey(ctx.role));
if (activePrompt?.content) {
  effectivePrompt = activePrompt.content;
}

const activeRole = versions.getActiveRole(ctx.role);
if (activeRole?.manifest_json) {
  const roleManifest = JSON.parse(activeRole.manifest_json || '{}');
  if (roleManifest.instructions) {
    effectivePrompt = [
      effectivePrompt,
      '',
      '## ACTIVE ROLE EVOLUTION OVERLAY',
      JSON.stringify(roleManifest, null, 2),
    ].join('\n');
  }
}
Then replace uses of prompt with effectivePrompt.

This makes learning-generated active prompt and role versions actually affect runtime behavior.

20. Orchestrator routing integration
Patch src/runtime/orchestrator.ts
Add import:

TypeScript

import { VersionManager } from '@/learning/version-manager.js';
At run init:

TypeScript

const versions = new VersionManager();
const activeRouting = versions.getActiveRouting();

function applyRouting(baseModels: Record<string, string>, missionCategory = 'general') {
  const cfg = activeRouting?.config_json
    ? JSON.parse(activeRouting.config_json || '{}')
    : null;

  if (!cfg?.rules) return baseModels;

  const matching = cfg.rules.find((r: any) =>
    r.mission_category === missionCategory || r.mission_category === '*'
  );

  if (!matching) return baseModels;

  return {
    ...baseModels,
    ...(matching.model_map ?? {}),
  };
}
Before model map is finalized:

TypeScript

config.models = applyRouting(config.models, config.missionCategory ?? 'general');
Now routing optimization actually affects real runs.

21. Release activation API path
Once an approval is granted, Phase 10 needs a path to activate the approved version.

Patch src/api/learning-routes.ts
TypeScript

import { getDb } from '@/db/migrate.js';
import { LearningOrchestrator } from '@/learning/learning-orchestrator.js';
import { ReleaseGate } from '@/learning/release-gate.js';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleLearningRoutes(url: URL, req: Request) {
  const method = req.method;

  if (url.pathname === '/api/learning/cycles' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM learning_cycles
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/run' && method === 'POST') {
    const body = await req.json().catch(() => ({})) as {
      suiteName?: string;
      runId?: string;
      cycleNumber?: number;
    };

    const learning = new LearningOrchestrator();
    const result = await learning.run(body);
    return json({ ok: true, result });
  }

  if (url.pathname === '/api/learning/proposals' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM improvement_proposals
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/prompt-versions' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM prompt_versions
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/policy-versions' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM policy_versions
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/role-versions' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM role_versions
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/routing-versions' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM routing_versions
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/simulations' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM simulation_runs
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/drift-reports' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM prompt_drift_reports
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    db.close();
    return json(rows);
  }

  if (url.pathname === '/api/learning/activate' && method === 'POST') {
    const body = await req.json() as {
      proposalId: string;
      versionKind: 'prompt' | 'policy' | 'role' | 'routing';
      versionId: string;
      artifactPath?: string;
    };

    const gate = new ReleaseGate();
    const result = gate.activate(body);
    return json({ ok: true, result });
  }

  return null;
}
22. Daemon integration
Phase 10 wants scheduled bounded self-improvement, not constant mutation.

Patch src/runtime/daemon.ts
Add imports:

TypeScript

import { LearningOrchestrator } from '@/learning/learning-orchestrator.js';
import { featureFlag } from '@/config/feature-flags.js';
Inside daemon loop, add a low-frequency learning trigger:

TypeScript

let lastLearningRunAt = 0;

setInterval(async () => {
  try {
    const now = Date.now();

    if (
      featureFlag('learningLoop') &&
      now - lastLearningRunAt > (Number(process.env.LEARNING_LOOP_INTERVAL_MS ?? 12 * 60 * 60 * 1000))
    ) {
      const learning = new LearningOrchestrator();
      await learning.run({
        suiteName: process.env.LEARNING_DEFAULT_SUITE ?? 'core',
        runId: 'daemon_learning',
        cycleNumber: 0,
      });
      lastLearningRunAt = now;
    }
  } catch (error) {
    console.error('Learning loop failed:', error);
  }
}, 60_000);
This ensures learning runs:

periodically,
bounded,
benchmark-gated,
approval-gated.
23. Self-improvement should be governed like any other risky action
Patch src/runtime/policy-engine.ts
Add default rules for self-improvement activation:

TypeScript

['CEO', 'PATCH', 'learning.prompt', 'high', 1, 1, 1, 1, 1],
['CEO', 'PATCH', 'learning.policy', 'high', 1, 1, 1, 1, 1],
['CEO', 'PATCH', 'learning.role', 'high', 1, 1, 1, 1, 1],
['CEO', 'PATCH', 'learning.routing', 'high', 1, 1, 1, 1, 1],
So activation of learned changes is explicitly treated as a high-risk patch event.

24. Results logger learning awareness
Patch src/runtime/results-logger.ts
If a run used a learned active version set, add metadata:

TypeScript

learnedPromptVersion,
learnedRoleVersion,
learnedRoutingVersion,
You don’t need them in TSV if that becomes awkward; a JSON sidecar is enough:

TypeScript

await Bun.write(
  `artifacts/learning/run-metadata/${runId}.json`,
  JSON.stringify({
    runId,
    learnedPromptVersion,
    learnedRoleVersion,
    learnedRoutingVersion,
  }, null, 2)
);
This is important for attribution when a later benchmark improves or regresses.

25. Minimal UI additions
text

web/app/
├── learning/page.tsx
├── proposals/page.tsx
├── versions/page.tsx
├── simulations/page.tsx
├── drift/page.tsx
└── memory-utility/page.tsx
Patch nav in web/app/layout.tsx
React

<nav className="ml-auto flex gap-6 text-sm">
  <a href="/" className="text-gray-400 hover:text-cyan-400 transition-colors">Dashboard</a>
  <a href="/graph" className="text-gray-400 hover:text-cyan-400 transition-colors">Graph</a>
  <a href="/approvals" className="text-gray-400 hover:text-cyan-400 transition-colors">Approvals</a>
  <a href="/budgets" className="text-gray-400 hover:text-cyan-400 transition-colors">Budgets</a>
  <a href="/locks" className="text-gray-400 hover:text-cyan-400 transition-colors">Locks</a>
  <a href="/issues" className="text-gray-400 hover:text-cyan-400 transition-colors">Issues</a>
  <a href="/tools" className="text-gray-400 hover:text-cyan-400 transition-colors">Tools</a>
  <a href="/evidence" className="text-gray-400 hover:text-cyan-400 transition-colors">Evidence</a>
  <a href="/ledger" className="text-gray-400 hover:text-cyan-400 transition-colors">Ledger</a>
  <a href="/provenance" className="text-gray-400 hover:text-cyan-400 transition-colors">Provenance</a>
  <a href="/security" className="text-gray-400 hover:text-cyan-400 transition-colors">Security</a>
  <a href="/benchmarks" className="text-gray-400 hover:text-cyan-400 transition-colors">Benchmarks</a>
  <a href="/leaderboard" className="text-gray-400 hover:text-cyan-400 transition-colors">Leaderboard</a>
  <a href="/regressions" className="text-gray-400 hover:text-cyan-400 transition-colors">Regressions</a>
  <a href="/replay" className="text-gray-400 hover:text-cyan-400 transition-colors">Replay</a>
  <a href="/portfolio" className="text-gray-400 hover:text-cyan-400 transition-colors">Portfolio</a>
  <a href="/capital" className="text-gray-400 hover:text-cyan-400 transition-colors">Capital</a>
  <a href="/council" className="text-gray-400 hover:text-cyan-400 transition-colors">Council</a>
  <a href="/tournament" className="text-gray-400 hover:text-cyan-400 transition-colors">Tournament</a>
  <a href="/exchanges" className="text-gray-400 hover:text-cyan-400 transition-colors">Exchanges</a>
  <a href="/workspaces" className="text-gray-400 hover:text-cyan-400 transition-colors">Workspaces</a>
  <a href="/runs" className="text-gray-400 hover:text-cyan-400 transition-colors">Runs</a>
  <a href="/templates" className="text-gray-400 hover:text-cyan-400 transition-colors">Templates</a>
  <a href="/billing" className="text-gray-400 hover:text-cyan-400 transition-colors">Billing</a>
  <a href="/agents" className="text-gray-400 hover:text-cyan-400 transition-colors">Agents</a>
  <a href="/comments" className="text-gray-400 hover:text-cyan-400 transition-colors">Comments</a>
  <a href="/compliance" className="text-gray-400 hover:text-cyan-400 transition-colors">Compliance</a>
  <a href="/admin" className="text-gray-400 hover:text-cyan-400 transition-colors">Admin</a>
  <a href="/learning" className="text-gray-400 hover:text-cyan-400 transition-colors">Learning</a>
  <a href="/proposals" className="text-gray-400 hover:text-cyan-400 transition-colors">Proposals</a>
  <a href="/versions" className="text-gray-400 hover:text-cyan-400 transition-colors">Versions</a>
  <a href="/simulations" className="text-gray-400 hover:text-cyan-400 transition-colors">Simulations</a>
  <a href="/drift" className="text-gray-400 hover:text-cyan-400 transition-colors">Drift</a>
  <a href="/memory-utility" className="text-gray-400 hover:text-cyan-400 transition-colors">Memory Utility</a>
</nav>
/learning
Show:

latest learning cycles
success/failure
proposals created
releases activated
/proposals
Show:

proposal type
target key
status
expected deltas
linked approval id
linked simulation
/versions
Show:

prompt/policy/role/routing versions
active vs candidate
benchmark score
drift score
ancestry
/simulations
Show:

candidate vs baseline
delta summary
benchmark pass
release recommendation
/drift
Show:

drift reports
regression risk
blocked yes/no
summary
/memory-utility
Show:

top retained memory items
low-utility archive candidates
archived/pruned items
26. Tests for Phase 10
tests/pattern-extractor-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { PatternReportSchema } from '../src/prompts/pattern-extractor.js';

describe('PatternReportSchema', () => {
  it('validates a mined pattern report', () => {
    const parsed = PatternReportSchema.parse({
      winning_patterns: ['Strict evidence packs improve groundedness'],
      failure_patterns: ['Aggressive routing cuts can hurt policy compliance'],
      cost_quality_tradeoffs: ['Cheaper critic model increases variance'],
      governance_patterns: ['Approval-gated releases preserve safety'],
      candidate_targets: [
        {
          proposal_type: 'prompt',
          target_key: 'role:Critic',
          why: 'Critic quality strongly predicts policy score',
        },
      ],
      summary: 'Prompt and routing are strongest next targets',
    });

    expect(parsed.candidate_targets.length).toBe(1);
  });
});
tests/version-manager.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { VersionManager } from '../src/learning/version-manager.js';

describe('VersionManager', () => {
  it('creates a prompt candidate version', () => {
    const vm = new VersionManager();
    const out = vm.createPromptCandidate({
      targetKey: 'role:CEO',
      content: 'Improved CEO prompt',
    });

    expect(out.versionId.startsWith('pv_')).toBe(true);
  });
});
tests/prompt-optimizer-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { PromptOptimizerSchema } from '../src/prompts/prompt-optimizer.js';

describe('PromptOptimizerSchema', () => {
  it('validates a prompt optimization result', () => {
    const parsed = PromptOptimizerSchema.parse({
      revised_prompt: 'Revised prompt text',
      change_summary: 'Clarifies evidence requirements',
      expected_improvements: ['Better groundedness'],
      regression_risks: ['May be slightly more verbose'],
    });

    expect(parsed.change_summary.length).toBeGreaterThan(5);
  });
});
tests/role-evolver-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { RoleEvolverSchema } from '../src/prompts/role-evolver.js';

describe('RoleEvolverSchema', () => {
  it('validates a role evolution result', () => {
    const parsed = RoleEvolverSchema.parse({
      manifest_json: {
        role_key: 'Critic',
        instructions: ['Attack unsupported claims aggressively'],
      },
      change_summary: 'Makes critic more evidence-focused',
      expected_improvements: ['Fewer unsupported claims'],
      regression_risks: ['Potentially slower reviews'],
    });

    expect(parsed.manifest_json.role_key).toBe('Critic');
  });
});
tests/memory-utility-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { MemoryUtilitySchema } from '../src/prompts/memory-utility.js';

describe('MemoryUtilitySchema', () => {
  it('validates memory utility scoring', () => {
    const parsed = MemoryUtilitySchema.parse({
      utility_score: 0.18,
      keep_recommendation: false,
      rationale: ['Rarely accessed', 'No citations in benchmark wins'],
    });

    expect(parsed.keep_recommendation).toBe(false);
  });
});
tests/routing-optimizer-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { RoutingOptimizerSchema } from '../src/prompts/routing-optimizer.js';

describe('RoutingOptimizerSchema', () => {
  it('validates routing optimization output', () => {
    const parsed = RoutingOptimizerSchema.parse({
      config_json: {
        rules: [
          {
            mission_category: 'research',
            model_map: { ceo: 'claude-opus-4', critic: 'claude-sonnet-4-5' },
          },
        ],
      },
      summary: 'Use strongest CEO model for research-heavy missions',
      expected_improvements: ['Higher gold match'],
      regression_risks: ['Slight cost increase'],
    });

    expect(parsed.config_json.rules.length).toBe(1);
  });
});
tests/drift-detector-schema.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { PromptDriftSchema } from '../src/prompts/prompt-drift-auditor.js';

describe('PromptDriftSchema', () => {
  it('validates prompt drift output', () => {
    const parsed = PromptDriftSchema.parse({
      drift_score: 0.22,
      regression_risk: 0.18,
      likely_shifts: ['More explicit evidence requirements'],
      blocked: false,
      summary: 'Low-risk refinement',
    });

    expect(parsed.blocked).toBe(false);
  });
});
tests/release-gate.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { ReleaseGate } from '../src/learning/release-gate.js';

describe('ReleaseGate', () => {
  it('blocks rollout when groundedness regresses too far', async () => {
    const gate = new ReleaseGate();
    const result = await gate.evaluate({
      proposalId: 'ip_test',
      versionKind: 'prompt',
      versionId: 'pv_test',
      simulationDelta: {
        score: 0.01,
        groundedness: -0.10,
        policy: 0,
      },
      driftReport: {
        drift_score: 0.2,
        regression_risk: 0.4,
        blocked: false,
        summary: 'safe',
      },
      runId: 'run_test',
      cycleNumber: 1,
    });

    expect(result.blocked).toBe(true);
  });
});
tests/adapter-distiller.test.ts
TypeScript

import { describe, it, expect } from 'bun:test';
import { AdapterDistiller } from '../src/learning/adapter-distiller.js';

describe('AdapterDistiller', () => {
  it('exports a dataset artifact', async () => {
    const d = new AdapterDistiller();
    const out = await d.exportDataset({
      jobKind: 'critic',
      minScore: 0.8,
      minPolicyCompliance: 0.95,
    });

    expect(out.jobId.startsWith('dst_')).toBe(true);
  });
});
27. Run instructions for Phase 10
Bash

# 1. Apply migration
bun run src/db/migrate-phase10.ts

# 2. Start daemon / API / dashboard
bun run src/runtime/daemon.ts
bun run src/api/server.ts
cd web && bun run dev

# 3. Trigger a learning cycle manually
curl -X POST http://localhost:3000/api/learning/run \
  -H "Content-Type: application/json" \
  -d '{"suiteName":"core","runId":"manual_learning","cycleNumber":0}'

# 4. List learning cycles
curl http://localhost:3000/api/learning/cycles

# 5. Inspect proposals
curl http://localhost:3000/api/learning/proposals

# 6. Inspect prompt versions
curl http://localhost:3000/api/learning/prompt-versions

# 7. Inspect simulations
curl http://localhost:3000/api/learning/simulations

# 8. Inspect drift reports
curl http://localhost:3000/api/learning/drift-reports

# 9. After approval, activate a released candidate
curl -X POST http://localhost:3000/api/learning/activate \
  -H "Content-Type: application/json" \
  -d '{
    "proposalId":"ip_...",
    "versionKind":"prompt",
    "versionId":"pv_..."
  }'
28. Optional .env additions for Phase 10
Bash

# ── LEARNING LOOP ────────────────────────────────────────────
LEARNING_LOOP_INTERVAL_MS=43200000
LEARNING_DEFAULT_SUITE=core
LEARNING_MAX_PROPOSALS_PER_CYCLE=5

# ── OPTIMIZATION TARGETS ─────────────────────────────────────
LEARNING_ENABLE_PROMPT_OPT=1
LEARNING_ENABLE_POLICY_OPT=1
LEARNING_ENABLE_ROLE_EVOLUTION=1
LEARNING_ENABLE_ROUTING_OPT=1
LEARNING_ENABLE_MEMORY_PRUNE=1
LEARNING_ENABLE_ADAPTER_DISTILL=1

# ── SIMULATION GATE ──────────────────────────────────────────
LEARNING_SIMULATION_SUITE=core
LEARNING_MAX_ALLOWED_SCORE_DROP=0.01
LEARNING_MAX_ALLOWED_GROUNDEDNESS_DROP=0.02
LEARNING_MAX_ALLOWED_POLICY_DROP=0.02

# ── DRIFT GUARD ──────────────────────────────────────────────
LEARNING_DRIFT_BLOCK_THRESHOLD=0.60
LEARNING_DRIFT_WARN_THRESHOLD=0.35

# ── MEMORY UTILITY ───────────────────────────────────────────
LEARNING_MEMORY_UTILITY_THRESHOLD=0.18
LEARNING_MEMORY_ARCHIVE_DIR=memory/archive

# ── DISTILLATION ─────────────────────────────────────────────
LEARNING_DISTILL_MIN_SCORE=0.82
LEARNING_DISTILL_MIN_POLICY=0.97
LEARNING_DISTILL_MAX_ROWS=500
29. What Phase 10 now gives you
At this point AutoOrg can:

text

✅ Mine winning and failure patterns from historical runs and benchmarks
✅ Convert those patterns into bounded self-improvement proposals
✅ Generate candidate prompt, policy, role, and routing revisions
✅ Score memory utility and archive low-value memory safely
✅ Export strong trace datasets for future distillation/fine-tuning
✅ Simulate candidate changes on benchmark suites before rollout
✅ Detect harmful prompt/behavior drift before activation
✅ Track lineage across proposals, versions, simulations, and releases
✅ Activate new learned versions only through approval gates
✅ Continuously adapt without losing auditability or governance
This is the phase where AutoOrg stops being only a product platform and becomes a bounded learning system.

30. Recommended implementation order
I’d build Phase 10 in this order:

DB migration
version manager + lineage
pattern miner
prompt optimizer
simulator
drift detector
release gate
routing optimizer
role evolution
memory utility + pruner
adapter distillation
learning orchestrator + daemon integration
Why:

first you need safe version control for learned changes,
then you need evidence for changes,
then you need simulation before activation,
then you can broaden into role/routing/memory optimization.
31. Final architecture state after Phase 10
By the end of this roadmap, AutoOrg is no longer just:

a multi-agent orchestrator,
or a benchmark lab,
or a portfolio system,
or a platform.
It becomes:

text

A governed, benchmarked, portfolio-capable, multi-tenant, tool-using,
self-improving autonomous organization operating under an immutable constitution,
with strict approvals, provenance, replayability, and release-gated learning.
That is the real “closed loop” version of the idea.





PART X: Practical implementation order (what to build first vs keep spec-only)
This is an “engineer’s ordering,” optimized for real reliability + measurable progress before adding platform/product complexity. The key principle: don’t scale the surface area until the core loop is safe, tool-grounded, and benchmarkable.

A. Build-first path (minimum viable “serious AutoOrg”)
Milestone 0 — Make the existing loop shippable locally (1–3 days)
Build now

One-command local run (bun start) that:
loads org.md + constitution.md
runs at least 1 cycle end-to-end
writes a stable artifact output (e.g., workspace/current_output.md)
writes results.tsv
A basic “run record” in DB (you likely already have this).
Keep spec-only for now

multi-tenant concepts
remote agents
portfolio orchestration
Why: you need a stable baseline before hardening; otherwise hardening work is untestable.

Milestone 1 — Phase 5.1 Hardening (the trust layer) (week 1)
Build now (highest ROI)

Strict approval blocking (hard gate)
“commit-worthy” results become pending actions only
approval is required before any git commit (materialization step)
ensure “no commit can happen” without approval in the strict mode
Workspace lock + concurrency safety
lock per repo/workspace/worktree
daemon/job runner cannot double-mutate
Crash recovery journal
checkpoint stages
on restart: resume safely or revert to safe checkpoint
Worker leases
heartbeat + reclaim expired tasks
Incident log
you’ll need it immediately when daemons run unattended
Keep spec-only for now

GitHub issue → task translation (nice, not core safety)
PR summary from diff (nice, not core safety)
team memory partitions (helpful later)
ULTRAPLAN SLAs (add once you observe timeouts)
Acceptance tests

run for 50+ cycles in daemon mode without:
double-commit
orphan tasks
approval bypass
lock deadlocks
kill the process mid-cycle and verify it resumes cleanly
Milestone 2 — Phase 6 Tool substrate (the grounding layer) (week 2)
Build now

Tool registry + tool runner + tool policy allowlists
At least these tools, end-to-end:
repo.search
repo.read_file
local_docs.search
web.fetch (optional if you want offline-only initially)
defer sandbox.exec until Phase 6.1 hooks are in
Tool traces persisted (DB + artifacts)

Evidence packs generated from tool traces

Tool-aware Critic (flags “you should have verified this”)

Keep spec-only for now

replay “full rerun” (artifact-only replay is enough early)
fancy connectors (tickets, Jira, etc.)
Acceptance tests

for a task requiring repo inspection, verify:
tool calls happen
evidence pack exists
final synthesis references evidence labels
groundedness clamp reacts to unsupported claims
Milestone 3 — Phase 6.1 Safety + provenance (the governance layer) (week 3–4)
Build now

Policy engine + risk tiers integrated into:
tool execution (especially execute)
publish/commit materialization
any outward actuation
Action ledger (append-only; proposed → pending approval → applied/reverted)

Redaction filter before persistence:

transcripts
memory writes
tool outputs
evidence packs
Signed immutable artifacts
artifact manifest + sha256 + signature
verify before materializing approved actions
Unsafe-action detector
at minimum for sandbox.exec and anything “publish-like”
Policy compliance score
feed into Judge / scoring as a clamp
Build after the above (still in 6.1, but second priority)

provenance linker (claim → evidence labels → evidence items)
exportable security audit bundle
Keep spec-only for now

deep “reversible action ledger” beyond core git/materialization + limited exec
super granular RBAC
heavy compliance/reporting UI polish
Acceptance tests

secrets in outputs get redacted
artifact tampering is detected and blocks materialization
critical-risk exec requires approval or is blocked
Milestone 4 — Phase 7 Benchmark lab + CI gate (the measurement layer) (week 4–5)
Build now

Benchmark suite loader + benchmark runner that uses the real orchestrator
Gold expectations + acceptance bands (start with a small “core” suite)
Regression detection:
score drop
groundedness drop
policy compliance drop
cost/latency blow-ups
CI workflow that blocks merges on:
acceptance failures
“error/critical” regressions
Keep spec-only for now

judge calibration “deep mode”
sophisticated replay (artifact-only replay is enough early)
multi-leaderboard product features
Acceptance tests

you can run bun run src/evals/benchmark-ci.ts and get a clear pass/fail
a known-bad change triggers a regression alarm
B. Add-next path (only after the above is stable)
Milestone 5 — Limited Portfolio (Phase 8 “lite”) (week 6+)
Build now (lite)

2–3 variants only (don’t start with 6+)
branch/worktree isolation
run variants sequentially or with limited parallelism
judge council (2–3 judges)
best-of-N synthesis
Keep spec-only for now

cross-org exchange quarantine (add later; high complexity)
tournament mode (nice-to-have)
capital allocator with LLM + priors (start deterministic first)
Why: portfolio multiplies your operational surface area. Only do it once hardening + benchmarks are solid.

C. Keep spec-only until you have real users (Phase 9 + Phase 10)
Phase 9 Platformization — keep mostly spec-only at first
Build later (when you truly need it)

multi-tenant auth
RBAC
hosted runs + remote agents
quotas/billing
template marketplace
backup/restore + retention
Exception (build early only if required)

“workspaceRoot scoping” (so runs are not anchored to process.cwd())
a minimal “hosted run queue” without full multi-tenant (single-tenant API keys)
Reason: platform features are expensive and easy to build “wrong” without real usage patterns.

Phase 10 Learning organization — keep spec-only until benchmarks are mature
Build later

prompt/policy/routing optimization loops
drift detection + simulation gate automation
distillation pipelines
Exception (build earlier if cheap)

version overlays (prompt/policy versioning) can be useful early without automated learning
store “active versions” and switch manually via approvals
Reason: automated self-improvement amplifies any scoring mistakes. You want:

a stable benchmark suite
a stable judge calibration story
stable policies and provenance before you let the system propose changes to itself.
D. Practical “build order” checklist (copy/paste)
text

BUILD NOW (core reliability + grounding + measurement)
1) Phase 5.1: strict approval blocking + locks + recovery journal + leases + incidents
2) Phase 6: tool registry + tool runner + traces + evidence packs (+ tool-aware critic)
3) Phase 6.1: policy/risk + redaction + signed artifacts + unsafe-action gating
4) Phase 7: benchmark suite + acceptance bands + regression alarms + CI gate

BUILD NEXT (leverage)
5) Phase 8-lite: 2–3 isolated variants + council + best-of-N synthesis

SPEC-ONLY FOR NOW (until real demand)
6) Phase 8 full: quarantine exchange + tournaments + complex allocator
7) Phase 9: multi-tenant + billing + remote agents + marketplace
8) Phase 10: automated learning loop + drift automation + distillation at scale
E. One more “practical engineering” rule that will save you time
Treat every large feature as two deliverables:

Runtime wiring (the system actually uses it)
Eval/observability wiring (you can prove it helped and debug when it breaks)
If a feature can’t be measured in Phase 7, it tends to turn into “feels better” debt.



Here is the complete CI/CD pipeline for AutoOrg, written as a full drop-in system with all supporting scripts, configs, and hooks.

AutoOrg — CI/CD Pipeline
Full GitHub Actions + Local Dev Pipeline
WHAT THIS COVERS
text

┌─────────────────────────────────────────────────────────────────────┐
│ CI (every PR + push)                                                │
│   lint → typecheck → unit tests → migrations → benchmark gate       │
│   → security scan → artifact integrity → approval health            │
│                                                                     │
│ CD (merge to main)                                                  │
│   build → smoke test → deploy (local / single-node / managed)      │
│   → post-deploy health check → rollback on failure                 │
│                                                                     │
│ Scheduled workflows                                                 │
│   nightly benchmark suite → weekly learning cycle                  │
│   → weekly security audit → monthly distillation export            │
│                                                                     │
│ Local dev hooks                                                     │
│   pre-commit → pre-push → commit message linting                   │
└─────────────────────────────────────────────────────────────────────┘
FILES CREATED
text

.github/
├── workflows/
│   ├── ci.yml                      ← main CI pipeline
│   ├── cd.yml                      ← deploy pipeline
│   ├── benchmarks-nightly.yml      ← nightly benchmark suite
│   ├── learning-weekly.yml         ← weekly learning cycle
│   ├── security-audit.yml          ← weekly security scan
│   ├── distillation-monthly.yml    ← monthly trace export
│   └── dependency-review.yml       ← dependency security review
├── actions/
│   ├── setup-autoorg/
│   │   └── action.yml              ← reusable setup composite action
│   ├── run-migrations/
│   │   └── action.yml
│   ├── benchmark-gate/
│   │   └── action.yml
│   └── health-check/
│       └── action.yml
└── CODEOWNERS

scripts/
├── ci/
│   ├── lint.ts                     ← lint entrypoint
│   ├── typecheck.ts                ← tsc entrypoint
│   ├── test-unit.ts                ← unit test runner
│   ├── migrate-all.ts              ← run all migrations in order
│   ├── smoke-test.ts               ← post-deploy smoke test
│   ├── health-check.ts             ← API/daemon health check
│   ├── security-scan.ts            ← artifact integrity + findings check
│   ├── approval-health.ts          ← stale approval + ledger audit
│   └── rollback.ts                 ← deployment rollback entrypoint
├── deploy/
│   ├── deploy-local.ts
│   ├── deploy-single-node.ts
│   └── deploy-managed.ts
└── hooks/
    ├── pre-commit
    ├── pre-push
    └── commit-msg
1. Reusable composite action: Setup AutoOrg