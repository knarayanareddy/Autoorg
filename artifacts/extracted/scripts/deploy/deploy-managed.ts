TypeScript

#!/usr/bin/env bun
import chalk from 'chalk';

async function main() {
  console.log(chalk.cyan('\n🚀 Deploying to managed cloud...\n'));
  // This is intentionally thin. Managed deployment should use
  // your cloud provider's deploy API or Terraform here.
  // For now: reserve the interface.
  console.log(chalk.yellow('Managed deploy: wire your cloud provider deploy API here'));
}

main();
14. API health endpoint
Without this, health checks have nothing to call.

Patch src/api/server.ts
TypeScript

import { getDb } from '@/db/migrate.js';

// Add before other route handling:
if (url.pathname === '/health') {
  const db = getDb();
  let dbOk = false;

  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {}

  db.close();

  const status = dbOk ? 200 : 503;
  return new Response(JSON.stringify({
    ok: dbOk,
    db: dbOk ? 'ok' : 'error',
    version: process.env.AUTOORG_VERSION ?? 'dev',
    ts: new Date().toISOString(),
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
15. Git hooks for local dev
scripts/hooks/pre-commit
Bash

#!/usr/bin/env bash
set -e

echo "🔍 Running pre-commit checks..."

# Typecheck
bun run scripts/ci/typecheck.ts --project tsconfig.json

# Lint only staged files
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx)$' || true)
if [ -n "$STAGED" ]; then
  bunx eslint $STAGED --max-warnings 0
  bunx prettier --check $STAGED
fi

# Check for secrets in staged files
if git diff --cached --name-only | xargs grep -lE "(sk-[A-Za-z0-9_\-]{20,}|sk-ant-|gh[pousr]_)" 2>/dev/null; then
  echo "❌ Potential secret in staged files. Aborting."
  exit 1
fi

echo "✅ Pre-commit checks passed"
scripts/hooks/pre-push
Bash

#!/usr/bin/env bash
set -e

echo "🔍 Running pre-push checks..."

bun test tests/ --timeout 30000
bun run scripts/ci/migrate-all.ts --verify

echo "✅ Pre-push checks passed"
scripts/hooks/commit-msg
Bash

#!/usr/bin/env bash

MSG=$(cat "$1")

PATTERN="^(feat|fix|chore|docs|test|refactor|perf|ci|build|style|revert)(\(.+\))?: .{5,}"

if ! echo "$MSG" | grep -qE "$PATTERN"; then
  echo "❌ Commit message doesn't match convention:"
  echo "   type(scope): message"
  echo "   e.g. feat(phase6): add tool policy enforcement"
  exit 1
fi

echo "✅ Commit message ok"
Install hooks
Bash

# Add to package.json scripts or setup.ts:
chmod +x scripts/hooks/pre-commit
chmod +x scripts/hooks/pre-push
chmod +x scripts/hooks/commit-msg
git config core.hooksPath scripts/hooks
16. CODEOWNERS
.github/CODEOWNERS
text

# Default owners for everything
*                           @knarayanareddy

# Core runtime
src/runtime/                @knarayanareddy
src/db/                     @knarayanareddy

# Evals (high risk — benchmark integrity)
src/evals/                  @knarayanareddy
benchmarks/                 @knarayanareddy

# Security + policy layer
src/runtime/policy-engine.ts  @knarayanareddy
src/runtime/safety-review.ts  @knarayanareddy
src/runtime/redaction.ts      @knarayanareddy

# Learning (high risk — self-modification)
src/learning/               @knarayanareddy

# Platform / tenant layer
src/platform/               @knarayanareddy

# CI/CD workflows
.github/                    @knarayanareddy

# Constitution is immutable — required owner sign-off
constitution.md             @knarayanareddy
17. Secrets + variables reference
Required GitHub Secrets
Bash

# ── LLM API KEYS ─────────────────────────────────────────────
ANTHROPIC_API_KEY
OPENAI_API_KEY

# ── SIGNING ──────────────────────────────────────────────────
AUTOORG_SIGNING_SECRET

# ── BENCHMARK (optional separate secret) ─────────────────────
BENCHMARK_SIGNING_SECRET

# ── STAGING ──────────────────────────────────────────────────
STAGING_DB_PATH
STAGING_SIGNING_SECRET
STAGING_API_KEY
STAGING_SSH_HOST
STAGING_SSH_USER
STAGING_SSH_KEY

# ── PRODUCTION ───────────────────────────────────────────────
PRODUCTION_DB_PATH
PRODUCTION_SIGNING_SECRET
PRODUCTION_API_KEY
PRODUCTION_SSH_HOST
PRODUCTION_SSH_USER
PRODUCTION_SSH_KEY
Required GitHub Variables (non-secret config)
Bash

# ── URLS ─────────────────────────────────────────────────────
STAGING_URL=https://staging.autoorg.yourdomain.com
PRODUCTION_URL=https://autoorg.yourdomain.com

# ── DEPLOYMENT ───────────────────────────────────────────────
PRODUCTION_DEPLOYMENT_MODE=single-node

# ── BENCHMARKS ───────────────────────────────────────────────
DEFAULT_BENCHMARK_SUITE=core
18. Package.json scripts
Add these to your package.json:

JSON

{
  "scripts": {
    "start": "bun run src/runtime/orchestrator.ts",
    "dev": "bun run --watch src/runtime/orchestrator.ts",
    "daemon": "bun run src/runtime/daemon.ts",
    "api": "bun run src/api/server.ts",

    "migrate": "bun run scripts/ci/migrate-all.ts",
    "migrate:verify": "bun run scripts/ci/migrate-all.ts --verify",

    "lint": "bun run scripts/ci/lint.ts",
    "typecheck": "bun run scripts/ci/typecheck.ts",
    "test": "bun test tests/ --timeout 30000",
    "test:watch": "bun test --watch tests/",
    "test:ci": "bun run scripts/ci/test-unit.ts",

    "bench": "bun run src/evals/benchmark-ci.ts",
    "bench:core": "BENCHMARK_SUITE=core bun run src/evals/benchmark-ci.ts",
    "bench:stress": "BENCHMARK_SUITE=stress bun run src/evals/benchmark-ci.ts",

    "health": "bun run scripts/ci/health-check.ts",
    "smoke": "bun run scripts/ci/smoke-test.ts",
    "security": "bun run scripts/ci/security-scan.ts",

    "learn": "bun run -e \"const { LearningOrchestrator } = await import('./src/learning/learning-orchestrator.ts'); const o = new LearningOrchestrator(); await o.run({});\"",

    "setup:hooks": "git config core.hooksPath scripts/hooks && chmod +x scripts/hooks/*",
    "ci": "bun run lint && bun run typecheck && bun run test:ci && bun run bench:core"
  }
}
19. Pipeline summary
text

EVERY PUSH / PR
─────────────────────────────────────────────────────────────
lint              → ESLint + Prettier
typecheck         → tsc (src + web)
unit-tests        → all tests/ under 30s timeout
migration-integrity → clean DB + idempotency + schema check
security-scan     → findings check + artifact integrity
build-check       → Next.js production build
[on non-draft PR]
  benchmark-gate  → core suite + acceptance + regression alarms
  PR comment      → auto-comment results
ci-gate           → all-or-nothing required check

MERGE TO MAIN
─────────────────────────────────────────────────────────────
pre-deploy-checks → no critical findings
build-release     → create signed release bundle
deploy-staging    → deploy + migrate + health + smoke test
[on failure]      → auto-rollback to previous SHA
deploy-production → deploy + migrate + health + smoke test + git tag
[on failure]      → auto-rollback to previous SHA

SCHEDULED
─────────────────────────────────────────────────────────────
02:00 UTC daily   → nightly benchmark suite
                  + constitution A/B comparison
                  + judge calibration
                  → open GitHub issue on regression

04:00 UTC Monday  → security audit
                  → export signed audit bundle
                  → open GitHub issue on critical findings

03:00 UTC Sunday  → bounded learning cycle
                  → pattern mining + proposals + simulations
                  → approval-gated rollout if passing

05:00 UTC 1st/month → distillation export (critic/judge/planner traces)

LOCAL DEV HOOKS
─────────────────────────────────────────────────────────────
pre-commit        → typecheck + lint staged + secret scan
pre-push          → unit tests + migration verify
commit-msg        → conventional commit format check





AutoOrg — Contributor Onboarding
Everything you need to go from zero to your first merged PR
PART 1: ORIENTATION
1.1 What AutoOrg actually is
AutoOrg is not a chatbot wrapper. It is not a RAG pipeline. It is not a "multi-agent demo."

It is an autonomous organization runtime — a system that:

reads a mission (org.md) and a governing constitution (constitution.md),
assembles a set of specialized agents (CEO, Engineer, Critic, Archivist, DevilsAdvocate, RatchetJudge),
runs those agents in a deterministic cycle,
scores every output against the constitution,
commits improvements to git and rejects regressions,
builds an evidence-backed knowledge graph of what it has learned,
operates unattended in daemon mode under strict approval gates.
The key design principles that separate AutoOrg from every other agent framework:

text

1. Constitution as law.
   constitution.md is immutable. It defines what "better" means.
   No agent can change it. No prompt can override it.

2. Ratchet as memory.
   Every cycle either improves the best-known output or reverts.
   Progress is monotonic within a run. History lives in results.tsv.

3. Git as audit trail.
   Every approved commit is traceable. Every pending commit is staged,
   not materialized. Approval comes before git history.

4. Evidence before claims.
   Agents use tools. Tool traces become evidence packs.
   Unsupported claims are penalized in scoring.

5. Governance before capability.
   Policy engine, risk tiers, signed artifacts, and redaction
   are in the critical path, not bolt-ons.
If you internalize these five principles, the rest of the codebase makes sense.

1.2 The big picture: what exists and where
text

src/
├── runtime/            ← core orchestration loop, ratchet, approval, daemon
├── adapters/           ← LLM provider adapters (Anthropic, OpenAI)
├── tools/              ← tool registry, runner, sandbox, evidence packs
├── evals/              ← benchmark suite, leaderboard, regression detection
├── portfolio/          ← multi-variant org orchestration
├── platform/           ← auth, RBAC, tenants, workspaces, billing
├── learning/           ← pattern mining, proposal generation, simulator
├── prompts/            ← all structured prompt definitions + Zod schemas
├── integrations/       ← GitHub, connectors, diff, issue translation
├── config/             ← feature flags, env loading
└── db/                 ← schema files + migration runners

roles/                  ← role prompt files (CEO.md, Critic.md, etc.)
benchmarks/             ← benchmark suites, gold outputs, case configs
portfolio/variants/     ← competing org variant manifests
platform/templates/     ← reusable org templates
memory/                 ← runtime memory (MEMORY.md + partitions)
workspace/              ← current working output per run
artifacts/              ← signed outputs, evidence, tools, security
web/                    ← Next.js dashboard (app router)
scripts/                ← CI/deploy/hook scripts
.github/                ← workflows + composite actions + CODEOWNERS
1.3 How a single run works (mental model)
Read this once. Refer back to it when confused.

text

bun start
  │
  ├─ Load org.md (mission)
  ├─ Load constitution.md (scoring law)
  ├─ Boot DB + migrations
  ├─ Write run manifest (signed)
  ├─ Initialize knowledge graph from seed material
  ├─ Initialize memory (shared + team partitions)
  ├─ Acquire workspace lock
  ├─ Seed tool policies + action policies
  │
  └─ MAIN CYCLE (repeats until stop condition)
        │
        ├─ CEO reads mission + memory + graph → produces directive
        ├─ CoordinatorLead assigns tasks to teams
        ├─ Each worker (Engineer / Critic / Archivist / DevilsAdvocate):
        │    ├─ Plans tool use
        │    ├─ Calls tools (repo.search, local_docs, web.fetch, etc.)
        │    ├─ Builds evidence pack from tool results
        │    └─ Produces output grounded in evidence
        │
        ├─ CEO synthesizes worker outputs into final proposal
        │
        ├─ Verification audit (claim → evidence coverage)
        ├─ Provenance linker (claim → citation → source → seed)
        ├─ Policy auditor (was everything governed correctly?)
        │
        ├─ RatchetJudge scores proposal against constitution
        │    → composite = groundedness + novelty + consistency + mission_alignment
        │    → clamped by policy_compliance
        │    → clamped by unsupported claim ratio
        │
        ├─ Ratchet decision:
        │    COMMIT  → stage pending action + request approval
        │    REVERT  → restore workspace, log result
        │
        ├─ Approval gate (if strict mode):
        │    approved → materialize commit to git history
        │    pending  → wait for human/API approval
        │
        ├─ Log to results.tsv
        ├─ Write checkpoint to DB
        └─ (every N cycles) DreamAgent consolidates memory
Everything else (portfolio, benchmarks, learning) is built on top of this core loop.

PART 2: LOCAL SETUP
2.1 Prerequisites
Bash

# Required
node (for Next.js)         >= 20
bun                        >= 1.1.x
git                        >= 2.40
ripgrep (rg)               latest     # for repo.search tool
sqlite3                    any        # for DB inspection

# Recommended dev tools
jq                         any        # for inspecting JSON artifacts
watchman                   any        # optional, speeds up file watch

# Verify
bun --version
rg --version
2.2 First-time setup
Bash

# 1. Clone
git clone https://github.com/knarayanareddy/Autoorg.git
cd Autoorg

# 2. Install dependencies
bun install

# 3. Install git hooks
bun run setup:hooks

# 4. Copy env file
cp .env.example .env

# 5. Fill in required keys in .env
#    At minimum:
#      DEFAULT_LLM_PROVIDER=anthropic
#      AUTOORG_API_KEY_ANTHROPIC=sk-ant-...
#      AUTOORG_SIGNING_SECRET=your-local-dev-secret

# 6. Run all DB migrations
bun run migrate

# 7. Verify setup
bun run migrate:verify

# 8. Run unit tests
bun test

# Expected: all tests pass, no migration errors
2.3 Run AutoOrg for the first time
Bash

# Start a single run (reads org.md + constitution.md from repo root)
bun start

# In a second terminal — watch dashboard
cd web && bun run dev
# Open http://localhost:3000

# In a third terminal — start the API
bun run api
If you want to try a short run first without a real org.md:

Bash

# Copy the example org
cp benchmarks/suites/core/planning-basic/org.md org.md
cp benchmarks/suites/core/planning-basic/constitution.md constitution.md

bun start
A successful run:

writes at least one row to results.tsv
creates at least one artifact under artifacts/
writes a workspace/current_output.md
2.4 Common first-run problems
text

PROBLEM                          FIX
─────────────────────────────────────────────────────────────
DB file locked                   Kill previous bun process. Check /tmp for leftover DB files.
rg not found                     Install ripgrep: brew install ripgrep / apt install ripgrep
API key error                    Check .env has correct AUTOORG_API_KEY_ANTHROPIC
Missing table error              Run: bun run migrate
Permission denied on artifacts/  Run: mkdir -p artifacts && chmod -R 755 artifacts
Approval gate blocks forever     Set AUTOORG_SKIP_APPROVALS=1 in .env for local dev only
Graph build fails                Ensure memory/ directory exists: mkdir -p memory/facts
2.5 Required .env keys for development
Bash

# ── REQUIRED ─────────────────────────────────────────────────
DEFAULT_LLM_PROVIDER=anthropic
AUTOORG_API_KEY_ANTHROPIC=sk-ant-your-key-here
AUTOORG_SIGNING_SECRET=local-dev-secret-change-me

# ── OPTIONAL FOR LOCAL DEV ────────────────────────────────────
AUTOORG_API_KEY_OPENAI=sk-your-openai-key-here
AUTOORG_DB_PATH=autoorg.db
AUTOORG_SKIP_APPROVALS=1
AUTOORG_DEPLOYMENT_MODE=local
AUTOORG_INSTANCE_NAME=dev-local

# ── FEATURE FLAGS FOR LOCAL DEV ───────────────────────────────
# Leave all feature flags unset to use their DB defaults.
# Override here only if debugging a specific feature.
# e.g. to force-enable tool use:
# FEATURE_TOOL_USE=1
PART 3: ARCHITECTURE TOUR
3.1 How to read the codebase
Start here in this exact order:

text

1.  org.md                           ← What the system is trying to do
2.  constitution.md                  ← What "good" means
3.  roles/CEO.md                     ← Who drives the loop
4.  roles/Critic.md                  ← Who attacks the output
5.  roles/RatchetJudge.md            ← Who scores the output
6.  src/runtime/orchestrator.ts      ← The main loop
7.  src/runtime/ratchet.ts           ← The scoring + commit decision
8.  src/runtime/approval-enforcer.ts ← The hard gate before git
9.  src/tools/tool-runner.ts         ← How agents call tools safely
10. src/runtime/policy-engine.ts     ← What is actually allowed
After those ten files you will understand the control flow end-to-end.

3.2 The runtime stack (layered view)
text

Layer 6: Learning
  └── LearningOrchestrator
      ├── PatternMiner
      ├── PromptOptimizer / PolicyOptimizer / RoleEvolver
      ├── Simulator → BenchmarkRunner
      ├── DriftDetector
      └── ReleaseGate

Layer 5: Portfolio
  └── PortfolioRunner
      ├── BranchStrategy (per-variant git worktrees)
      ├── PortfolioAllocator
      ├── JudgeCouncil
      ├── Tournament
      ├── BestOfN
      └── ExchangeBus → Quarantine

Layer 4: Benchmarks + Evals
  └── BenchmarkRunner
      ├── BenchmarkSuiteLoader
      ├── GoldEvaluator
      ├── LeaderboardService
      ├── RegressionDetector
      ├── ReplayLab
      └── JudgeCalibrator

Layer 3: Safety + Governance
  └── PolicyEngine → ActionLedger
      ├── RiskEngine
      ├── SafetyReview (unsafe action detector)
      ├── ApprovalEnforcer
      ├── RedactionFilter
      ├── ArtifactSigner
      └── ProvenanceBuilder → ClaimRegistry

Layer 2: Tool substrate
  └── ToolRunner → ToolRegistry
      ├── Manifests: repo.search / repo.read_file / local_docs / web.fetch / sandbox.exec
      ├── ToolPolicy (allowlists per role/team)
      ├── EvidencePackBuilder
      └── VerificationAuditor

Layer 1: Core loop
  └── Orchestrator
      ├── AgentRunner (LLM calls + evidence synthesis)
      ├── RatchetEngine (score → commit/revert)
      ├── ApprovalGate
      ├── RecoveryJournal + WorkspaceLock + LeaseManager
      ├── BudgetManager + TeamMemoryPartitions
      ├── DreamEngine (periodic memory consolidation)
      └── ResultsLogger (results.tsv)

Platform (cross-cutting)
  └── AuthService / RbacService / TenantContextResolver
      WorkspaceProvisioner / QuotaManager / BillingService
      HostedRunner / RemoteAgentService
      TemplateRegistry / BackupManager / RetentionManager
      ObservabilityService
3.3 Data flow for a single agent call
This is what actually happens when the orchestrator calls AgentRunner.runWithTools(...):

text

1. ToolPolicy.seedDefaults(teamId)   ← what tools are allowed for this role/team?

2. ToolPlanner prompt                ← LLM decides which tools are needed

3. PolicyEngine.evaluate(intent)     ← is this tool call permitted at this risk tier?

4. ActionLedger.propose(...)         ← record it as a proposed action

5. SafetyReview.review(...)          ← if EXECUTE/PUBLISH, check for unsafe patterns

6. ToolRunner.execute(toolName, ...) ← run the tool

7. Redaction.redact(output)          ← strip secrets and PII

8. ArtifactSigner.signFile(...)      ← sign the output artifact

9. ActionLedger.apply(...)           ← mark as applied

10. EvidencePackBuilder.fromExecutions(...)  ← bundle evidence

11. EvidenceSynthesizer prompt        ← LLM produces final answer grounded in evidence

12. VerificationAuditor.audit(...)    ← audit claims vs evidence

13. ProvenanceBuilder.linkDraft(...)  ← link claims to evidence items

14. PolicyAuditor.audit(...)          ← compute policy compliance score

15. RatchetJudge scores result        ← constitution scoring with all clamps applied
3.4 DB layout (key tables)
text

Core loop
  runs                      ← one row per orchestrator run
  cycles                    ← one row per cycle within a run
  approvals                 ← approval requests
  pending_actions           ← staged commit candidates (strict gate)
  delegated_tasks           ← CEO → team → worker task assignments

Tool substrate
  tool_definitions          ← registered tools
  tool_executions           ← every tool call
  tool_artifacts            ← excerpts/hits from tool calls
  evidence_packs            ← bundled tool output per worker/team/CEO
  evidence_items            ← individual evidence records

Governance
  action_ledger             ← append-only proposed/applied/reverted actions
  claim_registry            ← claims extracted from outputs
  claim_citations           ← claim → evidence → source → seed provenance
  security_findings         ← open security/policy violations
  redaction_events          ← what was redacted and why
  artifact_manifests        ← signed artifact metadata

Evals
  benchmark_suites          ← named benchmark groups
  benchmark_cases           ← individual scenarios
  benchmark_runs            ← suite executions
  benchmark_attempts        ← one case × one run
  benchmark_metrics         ← normalized scores per attempt
  leaderboards              ← aggregated comparative views
  regression_alarms         ← detected metric regressions

Learning
  learning_cycles           ← improvement loop executions
  improvement_proposals     ← candidate changes
  prompt_versions           ← versioned prompt overlays
  policy_versions           ← versioned policy configs
  role_versions             ← versioned role manifests
  simulation_runs           ← candidate vs baseline benchmarks
  rollout_decisions         ← release gate decisions

Platform
  tenants / users / memberships / sessions / api_keys
  workspaces / workspace_memberships
  quota_policies / quota_usage / billing_events
  hosted_runs / remote_agents
  org_templates / role_registry
  backup_jobs / retention_policies / compliance_logs
PART 4: HOW TO CONTRIBUTE
4.1 Types of contribution
text

TYPE                WHAT THIS LOOKS LIKE
────────────────────────────────────────────────────────────
Bug fix             A specific runtime behavior that is wrong.
                    Must include a test that reproduces the bug.

Tool manifest       A new tool (src/tools/manifests/*.ts).
                    Must include policy seeding + trace test.

Prompt improvement  A change to any file in src/prompts/ or roles/.
                    Must pass benchmark gate. Must not fail drift check.

New phase feature   A feature from the roadmap not yet built.
                    Must follow phase structure (schema + migration +
                    runtime + prompts + tests + API routes).

Benchmark case      A new benchmarks/suites/*/case.json + gold.md.
                    Should be realistic, measurable, deterministic.

Constitution edit   changes to constitution.md.
                    Requires owner sign-off. Requires A/B experiment
                    showing no regression on core suite.

Role edit           changes to roles/*.md.
                    Must pass benchmark gate + drift check.

Platform feature    Auth, RBAC, workspace, billing concerns.
                    Must include migration, API routes, tests.

Learning cycle      changes to src/learning/.
                    Must include simulator + gate + approval wiring.
4.2 Branch naming conventions
text

feat/phase-{N}-{short-description}        new phase feature
fix/{module}-{short-description}          bug fix
chore/{short-description}                 maintenance, deps, config
test/{short-description}                  test-only changes
bench/{short-description}                 benchmark additions/changes
docs/{short-description}                  documentation only
refactor/{short-description}              no behavior change
ci/{short-description}                    CI/CD changes
Examples:

text

feat/phase6-sandbox-exec
fix/approval-enforcer-double-commit
bench/core-grounded-research-case
docs/contributor-onboarding
ci/nightly-benchmark-schedule
4.3 Commit message format
AutoOrg uses conventional commits. The pre-commit hook enforces this.

text

type(scope): short description (< 72 chars)

Optional longer description.

Optional references:
- closes #123
- related to #456
Valid types:

text

feat      new feature
fix       bug fix
chore     maintenance / deps / tooling
docs      documentation only
test      tests only
refactor  behavior-neutral refactor
perf      performance improvement
ci        CI/CD changes
build     build system changes
style     formatting / no logic change
revert    revert a previous commit
Valid scopes:

text

runtime       orchestrator, ratchet, daemon, leases, locks
tools         tool registry, runner, manifests, evidence
governance    policy, action ledger, provenance, redaction, signing
evals         benchmarks, leaderboards, regressions, replay, calibration
portfolio     variants, allocator, council, tournament, exchange
platform      auth, RBAC, workspace, billing, templates, SDK
learning      pattern mining, proposals, versions, simulator, drift
prompts       any src/prompts/ change
roles         any roles/*.md change
db            schema or migration changes
api           API route changes
web           dashboard / UI changes
ci            GitHub Actions / scripts/ci
deps          dependency changes
Examples:

Bash

feat(tools): add sandbox.exec manifest with allowlist enforcement
fix(governance): approval enforcer now reverts staging file on denial
test(evals): add regression-detector schema test
bench(core): add grounded-research benchmark case with gold expectations
docs(runtime): add mental model for ratchet decision flow
chore(deps): upgrade bun to 1.1.38
4.4 PR checklist
Before opening a PR, verify every item:

text

REQUIRED (CI will enforce)
□ bun run lint              passes with 0 warnings
□ bun run typecheck         passes
□ bun test                  all tests pass
□ bun run migrate:verify    schema integrity ok
□ No secrets in diff        no API keys, tokens, or private keys

REQUIRED (for non-trivial changes)
□ New feature has tests      at minimum, schema validation tests
□ New DB table has migration  migration added to migrate-all.ts order
□ New tool has policy seeding tool manifest registered in bootstrap.ts
□ New prompt has Zod schema   every structured LLM output has a schema

REQUIRED (for prompt / role / constitution changes)
□ Benchmark gate passes       core suite acceptance + no regression alarms
□ Drift check passes          drift_score < 0.35, regression_risk < 0.60

OPTIONAL BUT APPRECIATED
□ API route added             if feature needs external access
□ UI page or nav link added   if feature produces data worth seeing
□ .env.example updated        if feature adds new env variables
□ Autoorg.md updated          if feature is a new phase addition
4.5 PR size guidelines
text

IDEAL PR            ≤ 400 lines changed
ACCEPTABLE          400–800 lines
REQUIRES SPLIT      > 800 lines (unless it is one migration + one feature)
If your PR is large, split it:

text

Bad  → PR #1: entire Phase 6 (tools + traces + evidence + critic + judge + API + UI)
Good → PR #1: tool registry + runner + 2 manifests + tests
       PR #2: evidence packs + verification auditor
       PR #3: tool-aware critic + judge clamp
       PR #4: API routes + UI
The person reviewing your PR has to understand the change.
Smaller PRs get reviewed faster.

4.6 How the review process works
text

1. Open PR
   ├─ CI runs: lint + typecheck + tests + migrations + security scan
   ├─ [non-draft PRs] benchmark gate runs + posts comment
   └─ CODEOWNERS auto-requested for review

2. Reviewer feedback
   ├─ Inline comments on code
   ├─ "Request changes" if something must be fixed
   └─ "Approve" when ready

3. Merge
   ├─ Squash merge preferred for feature branches
   ├─ Rebase+merge preferred for clean history branches
   └─ DO NOT force-push to main

4. CD triggers
   └─ deploy-staging → smoke test → [if main] deploy-production
PART 5: HOW TO BUILD A FEATURE
5.1 The canonical feature structure
Every non-trivial feature in AutoOrg follows this structure.
Use it as a template.

text

1. DB schema      (src/db/schema-phaseN.sql)
2. Migration      (src/db/migrate-phaseN.ts)
3. Prompts        (src/prompts/*.ts with Zod schema)
4. Runtime        (src/runtime/*.ts or src/learning/*.ts etc.)
5. API routes     (src/api/*.ts)
6. Agent wiring   (patch AgentRunner or Orchestrator)
7. Tests          (tests/*.test.ts)
8. UI             (web/app/*/page.tsx + nav link)
9. .env additions (.env.example)
You do not need all nine for small fixes.
You need all nine for new phase features.

5.2 Step-by-step: adding a new tool
Tools are the most common extension point. Here is the exact process.

Step 1: Create the connector
TypeScript

// src/integrations/connectors/my-connector.ts
export async function myConnector(input: {
  query: string;
  limit?: number;
}) {
  // your fetch/search/read logic
  return {
    summary: `Found results for ${input.query}`,
    hits: [],
  };
}
Step 2: Create the tool manifest
TypeScript

// src/tools/manifests/my-tool.ts
import { z } from 'zod';
import { myConnector } from '@/integrations/connectors/my-connector.js';
import type { ToolDefinition } from '@/tools/registry.js';

export const myTool: ToolDefinition = {
  name: 'my.tool',
  displayName: 'My Tool',
  capabilityClass: 'search',           // search / read / verify / execute / transform
  description: 'What this tool does in one sentence.',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    summary: z.string(),
    hits: z.array(z.any()),
  }),
  defaultTimeoutMs: 5000,
  replayable: true,
  dangerous: false,
  async execute(input, ctx) {
    const result = await myConnector(input);
    return {
      summary: result.summary,
      deterministic: true,
      output: result,
      sources: result.hits.map(h => ({
        type: 'file_hit',
        uri: h.uri,
        title: h.title,
        excerpt: h.excerpt,
      })),
    };
  },
};
Step 3: Register in bootstrap
TypeScript

// src/tools/bootstrap.ts — add import and register call
import { myTool } from '@/tools/manifests/my-tool.js';

export function bootstrapRegistry() {
  const registry = new ToolRegistry();
  // ... existing tools ...
  registry.register(myTool);
  return registry;
}
Step 4: Add tool policy defaults
TypeScript

// src/tools/tool-policy.ts — add to defaults array
['Engineer', 'my.tool', 1],
['Critic', 'my.tool', 1],
Step 5: Write a test
TypeScript

// tests/my-tool.test.ts
import { describe, it, expect } from 'bun:test';
import { bootstrapRegistry } from '../src/tools/bootstrap.js';
import { ToolRunner } from '../src/tools/tool-runner.js';
import { ToolPolicy } from '../src/tools/tool-policy.js';

describe('my.tool', () => {
  it('executes and returns sources', async () => {
    const runId = `run_mytest_${Date.now()}`;
    const registry = bootstrapRegistry();
    const policy = new ToolPolicy(runId);
    policy.seedDefaults();

    const runner = new ToolRunner(runId, registry);
    const result = await runner.execute('my.tool', { query: 'test query' }, {
      runId,
      cycleNumber: 1,
      role: 'Engineer',
    });

    expect(result.executionId).toMatch(/^tx_/);
    expect(typeof result.summary).toBe('string');
  });
});
Step 6: Verify
Bash

bun test tests/my-tool.test.ts
bun run typecheck
bun run lint
5.3 Step-by-step: adding a new prompt
Prompts in AutoOrg are typed contracts, not free-text strings.

Step 1: Define the schema
TypeScript

// src/prompts/my-prompt.ts
import { z } from 'zod';

export const MyPromptSchema = z.object({
  result: z.string(),
  confidence: z.number().min(0).max(1),
  concerns: z.array(z.string()).max(8),
});

export const MY_PROMPT_SYSTEM_PROMPT = `
You are AutoOrg's [Role].

Given:
- [input description]

Your job:
1. [what to do]
2. [how to do it]

Hard rules:
- [constraint 1]
- [constraint 2]
`.trim();
Step 2: Use it in a runtime file
TypeScript

// src/runtime/my-feature.ts
import { getAdapter } from '@/adapters/adapter-factory.js';
import { MY_PROMPT_SYSTEM_PROMPT, MyPromptSchema } from '@/prompts/my-prompt.js';

export async function runMyFeature(input: { context: string }) {
  const adapter = getAdapter({
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
    model: 'claude-sonnet-4-5',
  });

  return await adapter.structured({
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'system', content: MY_PROMPT_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input, null, 2) },
    ],
    schema: MyPromptSchema,
  });
}
Step 3: Write a schema test
TypeScript

// tests/my-prompt-schema.test.ts
import { describe, it, expect } from 'bun:test';
import { MyPromptSchema } from '../src/prompts/my-prompt.js';

describe('MyPromptSchema', () => {
  it('validates correct output', () => {
    const parsed = MyPromptSchema.parse({
      result: 'Some answer',
      confidence: 0.85,
      concerns: ['Missing verification'],
    });
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });
});
Note: schema tests should not call the LLM. They test that your Zod schema correctly validates/rejects shapes. This is how you get fast, reproducible tests for all prompt output types.

5.4 Step-by-step: adding a DB table
Step 1: Add to the appropriate schema file
SQL

-- src/db/schema-phaseN.sql
CREATE TABLE IF NOT EXISTS my_new_table (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  -- ... columns ...
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_my_new_table_run
  ON my_new_table(run_id, created_at DESC);
Step 2: Make sure migration is idempotent
Use CREATE TABLE IF NOT EXISTS and INSERT OR IGNORE.
Never use plain CREATE TABLE without IF NOT EXISTS.
This is what allows migrations to run twice on the same DB without error.

Step 3: Add migration to scripts/ci/migrate-all.ts
TypeScript

// scripts/ci/migrate-all.ts — add to MIGRATIONS array
'src/db/migrate-phaseN.ts',
And add to REQUIRED_TABLES if this table is critical:

TypeScript

const REQUIRED_TABLES = [
  // ... existing ...
  'my_new_table',
];
Step 4: Test it
Bash

# Clean run
AUTOORG_DB_PATH=/tmp/test-new-table.db bun run migrate
AUTOORG_DB_PATH=/tmp/test-new-table.db bun run migrate  # idempotency check
AUTOORG_DB_PATH=/tmp/test-new-table.db bun run migrate:verify
5.5 Step-by-step: editing a role prompt
Role prompt edits have the most governance around them because they affect every cycle's output quality.

Step 1: Understand what the role does
Read:

roles/{RoleName}.md — current instructions
src/prompts/ — any structured output schema for the role
constitution.md — what the role is ultimately judged against
Step 2: Make a narrow change
Do not rewrite role prompts. Make one specific improvement:

add a hard rule,
clarify an ambiguous instruction,
strengthen evidence requirements,
remove an instruction that conflicts with another role.
Step 3: Run the local drift check
Bash

bun run -e "
const { DriftDetector } = await import('./src/learning/drift-detector.ts');
const { readFile } = await import('node:fs/promises');

const detector = new DriftDetector('local-drift-check');
const original = await readFile('roles/Critic.md', 'utf-8');

// Paste your proposed new content here (or load from a temp file)
const proposed = await readFile('/tmp/Critic-candidate.md', 'utf-8');

const report = await detector.compare({
  targetKey: 'role:Critic',
  fromContent: original,
  toContent: proposed,
});

console.log(JSON.stringify(report.report, null, 2));
"
A passing drift check:

drift_score < 0.35,
regression_risk < 0.60,
blocked: false.
Step 4: Run benchmark gate locally (if you have API keys)
Bash

bun run bench:core
Step 5: Open PR and let CI decide
The PR will run the benchmark gate automatically.
If it regresses any metric beyond tolerance, CI will block it and post the results.

PART 6: TESTING GUIDE
6.1 Test philosophy
AutoOrg tests are split into three tiers:

text

TIER 1: Schema tests (fastest, no LLM, no DB)
  ─ Validate Zod schemas accept correct shapes
  ─ Validate Zod schemas reject wrong shapes
  ─ Pure TypeScript, < 5ms each
  ─ Should exist for EVERY structured prompt output

TIER 2: Runtime unit tests (fast, real DB, no LLM)
  ─ Test policy enforcement (can/cannot spend, can/cannot tool-call)
  ─ Test DB writes and reads
  ─ Test crypto (signing, verification, redaction)
  ─ Test lease/lock mechanics
  ─ These should NOT call the LLM

TIER 3: Integration tests (slow, requires API keys, real LLM)
  ─ Benchmark suite runs
  ─ Tool execution with real connectors
  ─ These live in evals/ not tests/
  ─ Only run in benchmark-gate CI job or locally with API keys
6.2 Writing a schema test
This is the most important test pattern in the codebase. Every new prompt schema needs one.

TypeScript

// tests/my-prompt-schema.test.ts
import { describe, it, expect } from 'bun:test';
import { MyPromptSchema } from '../src/prompts/my-prompt.js';

describe('MyPromptSchema', () => {
  // Test valid case
  it('accepts valid output', () => {
    const parsed = MyPromptSchema.parse({
      result: 'Some result',
      confidence: 0.88,
      concerns: ['One concern'],
    });
    expect(parsed.confidence).toBeGreaterThan(0.5);
    expect(parsed.concerns.length).toBe(1);
  });

  // Test edge cases
  it('accepts empty concerns array', () => {
    const parsed = MyPromptSchema.parse({
      result: 'Clean result',
      confidence: 1.0,
      concerns: [],
    });
    expect(parsed.concerns.length).toBe(0);
  });

  // Test rejection of bad input
  it('rejects confidence out of range', () => {
    expect(() => MyPromptSchema.parse({
      result: 'Bad',
      confidence: 1.5,            // > 1.0, should fail
      concerns: [],
    })).toThrow();
  });

  // Test max array length enforcement
  it('rejects too many concerns', () => {
    expect(() => MyPromptSchema.parse({
      result: 'Bad',
      confidence: 0.5,
      concerns: Array(20).fill('concern'),  // > 8, should fail
    })).toThrow();
  });
});
6.3 Writing a runtime unit test
TypeScript

// tests/budget-manager.test.ts
import { describe, it, expect } from 'bun:test';
import { BudgetManager } from '../src/runtime/budget-manager.js';

describe('BudgetManager', () => {
  // Use a unique run ID per test to avoid DB conflicts
  const runId = `run_budget_${Date.now()}`;

  it('seeds default budgets', () => {
    const budgets = new BudgetManager(runId);
    budgets.seedDefaults('team_research');

    // Verify a small spend is allowed
    expect(budgets.canSpend('team_research', 'usd', 0.1)).toBe(true);
  });

  it('enforces hard limits', () => {
    const budgets = new BudgetManager(runId);
    budgets.seedDefaults('team_test', { usdLimit: 0.5 });

    // Spend up to limit
    budgets.spend({
      teamId: 'team_test',
      budgetType: 'usd',
      delta: 0.4,
      reason: 'test',
    });

    // Next spend should fail
    expect(budgets.canSpend('team_test', 'usd', 0.2)).toBe(false);
  });

  it('throws on overspend when hard limit is set', () => {
    const budgets = new BudgetManager(runId);
    budgets.seedDefaults('team_strict', { usdLimit: 0.1 });

    // Spend full budget
    budgets.spend({ teamId: 'team_strict', budgetType: 'usd', delta: 0.1, reason: 'test' });

    // Next spend should throw
    expect(() => budgets.spend({
      teamId: 'team_strict',
      budgetType: 'usd',
      delta: 0.01,
      reason: 'overflow',
    })).toThrow('Budget exceeded');
  });
});
6.4 Running tests
Bash

# Run all tests
bun test

# Run a single test file
bun test tests/budget-manager.test.ts

# Run tests matching a pattern
bun test --grep "BudgetManager"

# Run tests in watch mode
bun test --watch

# Run with verbose output
bun test --verbose

# Run with timeout override
bun test --timeout 60000

# Run CI-style (produces junit.xml)
bun run test:ci
6.5 Test isolation rules
text

ALWAYS
  □ Use a unique runId per test: `run_feature_${Date.now()}`
  □ Use unique slugs/emails per test: `user_${Date.now()}@test.com`
  □ Clean up any created files in afterEach if they are large

NEVER
  □ Share DB state between tests in the same file
  □ Call the LLM in a Tier 1 or Tier 2 test
  □ Use process.cwd() as a hardcoded workspace root in tests
  □ Depend on test execution order
PART 7: DEBUGGING GUIDE
7.1 Debugging a run that produces bad output
Bash

# 1. Find the run ID
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare('SELECT id, status, created_at FROM runs ORDER BY created_at DESC LIMIT 5').all();
console.table(rows);
db.close();
"

# 2. Inspect cycles for the run
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  'SELECT cycle_number, decision, score, summary FROM results_log WHERE run_id = ? ORDER BY cycle_number'
).all('run_YOUR_ID_HERE');
console.table(rows);
db.close();
"

# 3. Inspect evidence packs for a cycle
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  'SELECT id, owner_role, kind, item_count, unsupported_claim_count, artifact_path FROM evidence_packs WHERE run_id = ? ORDER BY created_at'
).all('run_YOUR_ID_HERE');
console.table(rows);
db.close();
"

# 4. Read the evidence pack itself
cat artifacts/evidence/packs/ep_YOUR_PACK_ID.md

# 5. Inspect tool executions
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  'SELECT role, tool_name, status, output_summary, duration_ms FROM tool_executions WHERE run_id = ? ORDER BY created_at'
).all('run_YOUR_ID_HERE');
console.table(rows);
db.close();
"
7.2 Debugging a stalled approval gate
Bash

# Find pending actions
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  \"SELECT pa.id, pa.status, pa.action_type, a.status as approval_status, pa.created_at FROM pending_actions pa JOIN approvals a ON a.id = pa.approval_id WHERE pa.status = 'staged' ORDER BY pa.created_at\"
).all();
console.table(rows);
db.close();
"

# Manually approve via API (local dev)
curl -X POST http://localhost:3000/api/approvals/YOUR_APPROVAL_ID/action \
  -H "Content-Type: application/json" \
  -d '{"action":"approved","comment":"Manual approval for debugging"}'

# Or skip approvals entirely in local dev
echo "AUTOORG_SKIP_APPROVALS=1" >> .env
7.3 Debugging a failed DB migration
Bash

# See which tables exist
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();
console.log(tables.map(t => t.name).join('\n'));
db.close();
"

# Drop the DB and start fresh (local dev only, never in production)
rm autoorg.db
bun run migrate

# Check for syntax errors in schema file
sqlite3 /tmp/check.db < src/db/schema-phaseN.sql
7.4 Debugging policy denials
Bash

# Find denied actions
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  \"SELECT role, action_class, target_ref, risk_tier, status, output_json FROM action_ledger WHERE status IN ('denied','failed') ORDER BY created_at DESC LIMIT 20\"
).all();
console.table(rows.map(r => ({...r, output_json: JSON.parse(r.output_json || '{}')})));
db.close();
"

# Find denied tool executions
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  \"SELECT role, tool_name, status, error_text, created_at FROM tool_executions WHERE status IN ('denied','failed') ORDER BY created_at DESC LIMIT 20\"
).all();
console.table(rows);
db.close();
"
7.5 Debugging benchmark failures
Bash

# Run with verbose output
BENCHMARK_VERBOSE=1 bun run bench:core

# Inspect specific attempt
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare(
  'SELECT ba.id, ba.status, bm.score, bm.groundedness, bm.gold_match, bm.acceptance_pass, bm.policy_compliance FROM benchmark_attempts ba JOIN benchmark_metrics bm ON bm.attempt_id = ba.id ORDER BY ba.created_at DESC LIMIT 10'
).all();
console.table(rows);
db.close();
"

# Check regression alarms
bun run -e "
const { getDb } = await import('./src/db/migrate.ts');
const db = getDb();
const rows = db.prepare('SELECT * FROM regression_alarms ORDER BY created_at DESC LIMIT 20').all();
console.table(rows);
db.close();
"
7.6 Useful debug environment variables
Bash

# Skip approval gate (local dev only)
AUTOORG_SKIP_APPROVALS=1

# Verbose LLM call logging
AUTOORG_DEBUG_LLM=1

# Use a specific DB file
AUTOORG_DB_PATH=/tmp/my-debug.db

# Force a specific max cycles
AUTOORG_MAX_CYCLES=2

# Disable ratchet commit (run in read-only scoring mode)
AUTOORG_READONLY_MODE=1
PART 8: FEATURE FLAG SYSTEM
8.1 How feature flags work
Feature flags are stored in the feature_flags table.
They are read at runtime using featureFlag('flagName').
Schema migrations seed flags with their defaults.
You can override them via environment variables.

TypeScript

// Reading a feature flag
import { featureFlag } from '@/config/feature-flags.js';

if (featureFlag('toolUse')) {
  // tool-use path
}
8.2 Phase-by-phase flags
text

Phase 5.1 flags (hardening)
  strictApprovalBlocking    no commit without approved gate
  daemonRecovery            resume after crash
  workerLeases              heartbeat-based leases
  workspaceLocks            concurrency locks
  issueTranslation          GitHub issue → task
  teamBudgets               per-team budgets
  teamMemoryPartitions      per-team memory lanes

Phase 6 flags (tools)
  toolRegistry              tool manifest registry
  toolUse                   agents can plan and use tools
  toolPolicies              allowlists per role/team
  toolTraces                persist traces
  evidencePacks             build evidence packs
  sandboxExec               sandboxed execution
  toolAwareCritic           critic flags unsupported claims
  toolAwareJudge            judge receives verification report
  replayableToolTraces      replay from saved artifacts

Phase 6.1 flags (governance)
  policyEngine              action class policy gates
  actionLedger              append-only ledger
  provenanceChain           claim-to-citation tracking
  artifactSigning           signed manifests
  redactionFilters          secret/PII redaction
  riskTieredApprovals       escalate risky actions
  unsafeActionDetector      block dangerous execution
  policyAwareJudge          judge compliance clamp
  securityAuditExport       export audit bundles
  immutableArtifacts        write-once artifacts

Phase 7 flags (evals)
  benchmarkLab              suite execution
  goldEvaluator             acceptance band comparison
  leaderboards              cross-model rankings
  constitutionAB            A/B testing
  regressionAlarms          regression detection
  offlineReplayLab          offline replay
  judgeCalibration          consistency harness
  templateBakeoffs          org template comparison
  benchmarkCI               CI gate

Phase 8 flags (portfolio)
  portfolioOrchestration    concurrent variants
  portfolioAllocator        capital routing
  judgeCouncil              council voting
  tournamentMode            bracket competition
  crossOrgQuarantine        quarantined exchange
  bestOfNSynthesis          top-N synthesis
  branchPerOrg              git branch isolation
  failureContainment        variant kill-switch
  portfolioDashboard        portfolio UI

Phase 9 flags (platform)
  multiTenantAuth           tenant/user/session
  rbacPlatform              RBAC
  hostedRuns                hosted run dispatch
  remoteAgents              remote workers
  templateMarketplace       template/role registry
  billingAndQuotas          quota enforcement
  workspaceIsolation        workspace provisioning
  backupRestore             backup jobs
  complianceRetention       compliance logs
  adminObservability        admin dashboard
  publicApiSdk              SDK

Phase 10 flags (learning)
  learningLoop              self-improvement loop
  patternMining             pattern extraction
  promptOptimization        prompt revision
  policyOptimization        policy revision
  roleEvolution             role revision
  memoryUtilityPruning      memory pruning
  routingOptimization       routing optimization
  adapterDistillation       trace export
  simulateBeforeRollout     simulation gate
  selfImprovementApproval   approval-gated rollout
  promptDriftGuard          drift detection
  learningLineage           ancestry tracking
8.3 Overriding flags in local dev
Bash

# Disable a flag locally (even if seeded as enabled)
FEATURE_STRICT_APPROVAL_BLOCKING=0 bun start

# Enable a flag locally (even if seeded as disabled)
FEATURE_PORTFOLIO_ORCHESTRATION=1 bun start
PART 9: ARCHITECTURAL CONSTRAINTS
These are the rules that must not be broken.
They are not preferences. They are load-bearing constraints.

9.1 The constitution is immutable at runtime
text

✅ Constitution text can be changed between runs (via PR + A/B experiment).
❌ Constitution text cannot be changed within a run.
❌ No agent can override, extend, or bypass the constitution.
❌ No prompt can add or remove scoring criteria mid-run.
If you find code that lets an agent write back to constitution.md, that is a bug.

9.2 Approval must come before materialization
text

✅ A cycle can decide "this deserves a commit."
✅ That decision is staged as a pending action.
✅ The pending action has a signed artifact.
✅ An approval must be granted before the artifact materializes in git history.
❌ git commit must never happen before approval when strictApprovalBlocking is on.
❌ You cannot "approve and commit at the same time" in a single transaction.
The ApprovalEnforcer.stageCommitCandidate(...) and materializeApprovedActions(...) pattern enforces this split. Do not collapse them.

9.3 Every LLM output must go through a Zod schema
text

✅ adapter.structured({ schema: MyZodSchema })
❌ JSON.parse(response) without validation
❌ Trusting LLM string output directly as code logic input
Zod schemas are your type boundary at the LLM interface. They catch hallucinated fields and missing fields before they propagate downstream.

9.4 Every meaningful file write must go through ImmutableArtifacts
text

✅ ImmutableArtifacts.writeText(...)
✅ ImmutableArtifacts.writeJson(...)
❌ Raw fs.writeFile() for evidence packs, pending actions, or security artifacts
❌ Raw Bun.write() for signing-critical files
ImmutableArtifacts ensures:

the file is signed,
the manifest is recorded in DB,
the file is chmod 444 (best-effort),
verification is possible later.
9.5 Every secret or PII must go through RedactionFilter before persistence
text

✅ redactor.redact(text, { channel: 'artifact' })
❌ Writing raw LLM output to transcript or memory without redaction
❌ Storing raw tool output directly without redaction
The redaction filter catches API keys, GitHub tokens, private key blocks, emails, SSNs, and phone numbers. It logs every redaction event.

9.6 The policy engine is in the critical path for execute and publish
text

✅ PolicyEngine.evaluate(intent) → check result → proceed or deny
✅ ActionLedger.propose() → record → apply/deny/fail
❌ Calling sandbox.exec or git push without going through the policy engine
❌ Skipping the risk engine for actions labeled "internal"
9.7 Benchmark scores must be reproducible
text

✅ Gold expectations are stable per case (in benchmarks/suites/**/gold.md)
✅ Acceptance bands are in case.json and not changed per-run
❌ Modifying acceptance bands to make a failing test pass
❌ "Curve fitting" prompts directly to benchmark cases
The benchmark suite is the ground truth. Improving it is fine. Gaming it breaks the whole measurement system.

PART 10: WHERE TO GET HELP
10.1 Read these first before asking
text

Problem                              Read first
──────────────────────────────────────────────────────────────
"I don't understand the loop"        Part 1.3 (mental model)
"My migration failed"                Section 5.4 (DB guide)
"My test is failing"                 Section 6 (testing guide)
"Approval gate is stuck"             Section 7.2 (debug guide)
"Policy is denying my action"        Section 7.4 (policy debug)
"Benchmark is failing"               Section 7.5 (bench debug)
"Feature flag isn't working"         Part 8 (flags)
"I want to add a tool"               Section 5.2 (tool guide)
"I want to edit a role prompt"       Section 5.5 (role guide)
"I don't know what to work on"       Practical implementation order
10.2 How to ask a good question
Provide:

What you expected to happen
What actually happened (exact error + stack trace)
What you already tried
Relevant run ID or test name
Your .env setup (without secrets — just which keys are set)
Bad question:

"The tool doesn't work"

Good question:

"Running repo.search tool via the ToolRunner in cycle 3 of run run_abc123.
Expected: execution record in tool_executions with status='completed'.
Actual: status='denied', error_text='Tool repo.search is not allowed for role Engineer'.
Already tried: checked tool_policies table — no rows for run_abc123.
Suspect: seedDefaults() is not being called before the cycle starts."

10.3 What to do if you find a security issue
Do not open a public GitHub issue for security vulnerabilities.

Instead:

Email the maintainer directly.
Include: description, reproduction steps, potential impact.
You will get a response within 48 hours.
A fix will be prepared and disclosed responsibly.
10.4 Quick reference card (print this)
text

START A RUN           bun start
START DAEMON          bun run daemon
START API             bun run api
START DASHBOARD       cd web && bun run dev

RUN ALL MIGRATIONS    bun run migrate
VERIFY SCHEMA         bun run migrate:verify

RUN TESTS             bun test
RUN SPECIFIC TEST     bun test tests/my-file.test.ts
RUN BENCHMARK         bun run bench:core

LINT                  bun run lint
TYPECHECK             bun run typecheck
FULL CI               bun run ci

INSTALL HOOKS         bun run setup:hooks
CHECK HEALTH          bun run health
SMOKE TEST            bun run smoke

INSPECT DB            bun run -e "..."
ROLLBACK RUN          bun run scripts/ci/rollback.ts

KEY FILES
  org.md                  → mission
  constitution.md         → scoring law
  roles/*.md              → agent instructions
  results.tsv             → run history
  src/runtime/orchestrator.ts  → main loop
  src/runtime/ratchet.ts       → scoring engine
  src/tools/tool-runner.ts     → tool execution
  src/runtime/policy-engine.ts → policy control

KEY ENV VARS (local dev)
  AUTOORG_DB_PATH=autoorg.db
  AUTOORG_SKIP_APPROVALS=1
  AUTOORG_DEBUG_LLM=1
  DEFAULT_LLM_PROVIDER=anthropic
Welcome to AutoOrg. If something in this document is wrong or missing, open a PR. Contributor documentation is a first-class feature.





AutoOrg — Go-To-Market Strategy
From Research Operating System to Category-Defining Platform
PART 1: MARKET FRAMING
1.1 What problem this actually solves
Before positioning, strategy, or pricing — get the problem statement exactly right. The wrong problem statement sends you after the wrong customers.

Wrong framing:

"AutoOrg is a better multi-agent framework."

Nobody wakes up thinking "I need a better multi-agent framework." That is a solution, not a problem.

Wrong framing:

"AutoOrg automates knowledge work."

Too vague. Every AI company says this. It means nothing to a buyer.

Right framing:

text

Organizations that depend on high-stakes knowledge work
(strategy, research, engineering planning, quality assurance)
have no reliable way to run that work autonomously, repeatedly,
and under governance — so they either keep it fully manual,
or they hand it to AI systems they cannot audit, measure, or trust.

AutoOrg solves the governance gap in autonomous AI work:
the space between "demo that looks impressive"
and "production system a responsible organization can actually run."
This framing is defensible, specific, and gets sharper as governance pressure increases across AI regulation globally.

1.2 The category
AutoOrg should own a category, not join one.

Existing categories are wrong fits:

text

CATEGORY              WHY IT'S A WRONG FIT
────────────────────────────────────────────────────────────────
AI assistants         AutoOrg is not interactive / chat-first
LLM frameworks        LangChain, CrewAI — too developer-primitive
Workflow automation   Zapier, Make — wrong abstraction level
RPA                   Legacy, UI-scraping focus
Research tools        Too narrow
Agent platforms       Correct direction but no governance story
The right category to own:

text

AUTONOMOUS WORK GOVERNANCE

The discipline of running AI-driven knowledge work
in a way that is auditable, reversible, policy-governed,
benchmarked, and continuously improving — without
requiring a human in every loop iteration.
This category does not exist yet as a named market segment. That is the opportunity. AutoOrg should name it and own the definition.

Working category name: "Governed Autonomous Work" or "Autonomous Work Infrastructure."

1.3 The market timing argument
Three forces are converging right now:

text

FORCE 1: Capability exists but trust does not
  AI can do real knowledge work.
  Organizations do not trust it in production.
  The gap is governance, auditability, and measurement — not capability.
  AutoOrg closes that gap.

FORCE 2: Regulatory pressure is arriving
  EU AI Act, US executive orders, enterprise AI policies.
  "You used AI and cannot show what it did" is becoming a liability.
  Every organization that runs AI needs an audit trail.
  AutoOrg builds that trail by default.

FORCE 3: The labor arbitrage story is collapsing
  "AI replaces headcount" is already a political and reputational risk.
  "AI augments governance-controlled work" is the defensible story.
  AutoOrg is architecturally designed for the second story.
The window to define this category is approximately 18–24 months before a larger player (Salesforce, ServiceNow, Palantir, or a hyperscaler) either acquires into it or defines their own version. Move in that window.

PART 2: CUSTOMER DEFINITION
2.1 Ideal customer profile (ICP)
Do not try to sell to everyone. The ICP for the first 24 months is narrow.

Primary ICP: AI Engineering Teams at Mid-to-Large Enterprises
text

PROFILE
────────────────────────────────────────────────────────────────
Company size          500–10,000 employees
Industry              Financial services, healthcare, legal tech,
                      defense/GovTech, enterprise software
Department            AI/ML engineering, platform engineering,
                      automation center of excellence
Team size             5–40 engineers
Current state         Has run AI pilots; struggling to move to production
AI budget             $200K–$5M/year in LLM spend
Key frustration       "We can demo AI doing this. We can't run it
                      in production because we can't audit it,
                      it hallucinates, and compliance won't approve it."
Secondary ICP: AI-Native Product Companies
text

PROFILE
────────────────────────────────────────────────────────────────
Company size          20–200 employees
Industry              Legal AI, research AI, document AI,
                      strategy consulting AI
Department            Engineering (core product team)
Current state         Building AI-first product; needs governance
                      infrastructure without building it themselves
AI budget             $50K–$1M/year
Key frustration       "We're shipping AI features faster than we can
                      validate them. We have no systematic way to
                      benchmark quality or catch regressions."
Tertiary ICP (later): Research Organizations
text

PROFILE
────────────────────────────────────────────────────────────────
Org type              Think tanks, consultancies, policy research
                      organizations, academic research labs
Department            Research operations, strategy
Current state         Manual research cycles, inconsistent quality
Key frustration       "Our research quality is inconsistent and
                      depends on individual analyst skill.
                      We cannot scale output without scaling headcount."
2.2 Buyer vs user vs champion
Understanding the three-way decision dynamic is critical.

text

ROLE        WHO                  WHAT THEY CARE ABOUT
──────────────────────────────────────────────────────────────────
Champion    AI/ML engineer       Technical credibility, real tool
            or staff engineer    they can actually use; API quality;
                                 open architecture; not a black box

Buyer       VP Engineering,      ROI, risk reduction, compliance story,
            CTO, Head of AI      team productivity, vendor durability

Blocker     CISO, Legal,         Data security, audit trail, PII
            Compliance, Risk     handling, reversibility, no secret
                                 leakage, governance evidence
AutoOrg's architecture is built specifically to satisfy all three:

Champion: open TypeScript runtime, real tool traces, composable
Buyer: benchmark metrics, cost tracking, results.tsv history
Blocker: redaction, signed artifacts, action ledger, approval gates
This tri-role alignment is a structural advantage. Make it explicit in every sales conversation.

2.3 Jobs to be done
These are the actual jobs customers are hiring AutoOrg to do.

text

JOB 1: Validate that our AI system is improving, not just changing
  Context: Team ships prompt changes but has no way to know if the
  changes helped or hurt. Results feel subjective.
  AutoOrg delivers: Benchmark regression detection, results.tsv,
  judge calibration, gold output comparisons.

JOB 2: Run AI-driven research or analysis without babysitting it
  Context: Every AI pipeline needs someone watching it.
  Running it overnight is terrifying.
  AutoOrg delivers: Daemon mode, crash recovery, approval gates,
  workspace locks, worker leases, incident log.

JOB 3: Pass the compliance/audit review for AI systems
  Context: Security review asks "how do you know what the AI did?"
  and the answer is currently "we don't."
  AutoOrg delivers: Action ledger, signed artifacts, redaction
  events, compliance logs, security audit bundle.

JOB 4: Stop manually comparing AI outputs to decide which is better
  Context: Team runs five prompt variants, reads outputs, debates
  which is best. Subjective, slow, inconsistent.
  AutoOrg delivers: Portfolio orchestration, judge council, tournament
  mode, leaderboards, acceptance bands.

JOB 5: Give AI systems a "taste" for the organization's standards
  Context: LLM doesn't know what "good" means for this specific
  organization. Quality is inconsistent.
  AutoOrg delivers: constitution.md as law, ratchet enforcement,
  org.md mission contract, role specialization.
PART 3: PRICING AND PACKAGING
3.1 Pricing philosophy
Three principles:

text

1. VALUE-BASED, NOT USAGE-BASED
   Charge for outcomes (runs that work, governance that holds,
   benchmarks that improve) not raw token or API call volume.
   Usage-based pricing punishes the successful customer and
   rewards the unsuccessful one.

2. LAND SMALL, EXPAND WIDE
   The first deal should be affordable for one team to approve.
   The expansion should follow team adoption, not a seat count.
   Expansion drivers: workspaces, portfolio variants, benchmark suites,
   learning cycles, and hosted run volume.

3. OPEN CORE TO CAPTURE DEVELOPERS
   The core runtime is open source.
   Governance, benchmarking, portfolio, platform, and learning features
   are commercial. This mirrors the successful Elastic/HashiCorp/dbt model.
3.2 Packaging tiers
text

┌──────────────────────────────────────────────────────────────────────┐
│ TIER: OPEN SOURCE (free, self-hosted, MIT license)                   │
├──────────────────────────────────────────────────────────────────────┤
│ Core orchestrator loop                                               │
│ Local ratchet engine                                                 │
│ Basic tool registry (repo.search, local_docs, web.fetch)             │
│ Phase 5 memory + graph                                               │
│ SQLite DB                                                            │
│ results.tsv logging                                                  │
│ Single org, single user, local only                                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ TIER: TEAM — $800/month per workspace                                │
├──────────────────────────────────────────────────────────────────────┤
│ Everything in Open Source, plus:                                     │
│ Strict approval blocking + action ledger                             │
│ Signed artifacts + redaction filters                                 │
│ Evidence packs + verification audit                                  │
│ Provenance chain                                                     │
│ Benchmark suite (up to 20 cases)                                     │
│ Regression detection                                                 │
│ Team memory partitions                                               │
│ Per-team budgets                                                     │
│ Crash recovery + daemon mode                                         │
│ GitHub integration (issues, PRs)                                     │
│ Dashboard (all views)                                                │
│ Up to 5 users per workspace                                          │
│ Community Slack support                                              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ TIER: PROFESSIONAL — $3,500/month per workspace                      │
├──────────────────────────────────────────────────────────────────────┤
│ Everything in Team, plus:                                            │
│ Portfolio orchestration (up to 6 variants)                           │
│ Judge council + tournament mode                                      │
│ Best-of-N synthesis                                                  │
│ Cross-org quarantined exchange                                       │
│ Constitution A/B experiments                                         │
│ Template marketplace (private + public)                              │
│ Unlimited benchmark cases                                            │
│ Judge calibration harness                                            │
│ Replay lab                                                           │
│ Leaderboards                                                         │
│ Security audit export                                                │
│ Compliance logs + retention policies                                 │
│ Backup / restore                                                     │
│ Up to 20 users per workspace                                         │
│ Remote agents (up to 5)                                              │
│ Email support SLA: 24hr                                              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ TIER: ENTERPRISE — custom pricing, annual contract                   │
├──────────────────────────────────────────────────────────────────────┤
│ Everything in Professional, plus:                                    │
│ Bounded learning loop (pattern mining + proposals + simulation)      │
│ Prompt/policy/role/routing optimization                              │
│ Distillation export pipeline                                         │
│ Drift guard + release gate automation                                │
│ Multi-tenant admin                                                   │
│ SSO / SAML / OIDC                                                    │
│ Custom RBAC + permission overrides                                   │
│ Unlimited users, workspaces, remote agents                           │
│ Dedicated Slack channel                                              │
│ Monthly business review                                              │
│ Custom benchmark suite development                                   │
│ SLA: 4hr critical, 24hr non-critical                                 │
│ On-premise deployment option                                         │
│ SOC 2 Type II report                                                 │
│ DPA + BAA available                                                  │
│ Custom data retention                                                │
└──────────────────────────────────────────────────────────────────────┘
3.3 Expansion levers (post-land)
text

LEVER                         DRIVER
──────────────────────────────────────────────────────────────────
Additional workspaces         New team or project adopts AutoOrg
Additional portfolio slots    Customer wants more than 6 variants
Hosted run volume             Customer moves from self-host to managed
Remote agent seats            Parallel hosted execution scale-up
Custom benchmark case build   Professional services attachment
Learning cycle activation     Customer wants self-improvement enabled
SOC 2 / compliance report     Enterprise deals in regulated industry
Training and onboarding       Large team rollouts
3.4 Open-source monetization model
text

OPEN SOURCE ROLE            TO DRIVE
──────────────────────────────────────────────────────────────────────
Build developer trust        Developers evaluate by using, not reading
Generate benchmark data      Public benchmark submissions help AutoOrg
                             improve its own scoring calibration
Drive community templates    Community-published org templates feed
                             the marketplace
Surface enterprise leads     Self-hosted → "we want managed" funnel
Competitive moat             Hard to fork governance, benchmark,
                             portfolio, and learning layers together
The key open-source principle: the runtime is free. The trust layer is not.

A customer can run AutoOrg in a loop on their laptop forever for free.
The moment they need to prove it worked, prove it is safe, prove it is improving,
or run it at scale — that is the commercial product.

PART 4: DISTRIBUTION CHANNELS
4.1 Channel priority (first 18 months)
text

PRIORITY  CHANNEL                   WHY
────────────────────────────────────────────────────────────────
1         Developer community       Self-serve. Zero CAC.
          (GitHub + Discord/Slack)  Converts to paid via usage.

2         Content + SEO             Compound interest. Starts slow.
          (technical blog)          Becomes dominant by month 12.

3         Direct outbound           Short feedback loop.
          (founder-led sales)       ICP precision. $0 marketing spend.

4         Conference presence       Developer trust building.
          (AI/ML focused)           Two or three targeted events.

5         Partner integrations      Reach existing AI tool user bases.
          (GitHub, Anthropic,
           OpenAI ecosystem)
Channels to avoid early:

text

AVOID EARLY          WHY
────────────────────────────────────────────────────────────────
Paid ads             CAC is too high before PMF is confirmed
Product Hunt         Drives wrong audience (consumer AI fans)
Analyst briefings    Too early; analysts wait for market size evidence
Resellers/VARs       Too early; margin kill + slow feedback loop
4.2 Developer community motion
The open-source repo is the primary top-of-funnel asset.

text

GITHUB REPO OPTIMIZATION
  □ README leads with the problem, not the architecture
  □ 5-minute quickstart that produces visible output
  □ architecture.md with the mental model diagram
  □ CHANGELOG that demonstrates progress
  □ Good first issues labeled and maintained
  □ Benchmark leaderboard published publicly (shows the system works)
  □ Example org.md + constitution.md for 3 use cases

COMMUNITY SPACES
  □ Discord server (not Slack — lower barrier to join)
  □ Weekly office hours (async-friendly; recorded)
  □ #showcase channel for users to share their org.md setups
  □ #benchmarks channel for community benchmark submissions
  □ Contributor recognition (top contributors get swag + credits)

COMMUNITY CONTENT
  □ "Build your first autonomous org in 20 minutes" video
  □ Monthly "what changed and why" community update
  □ Public results.tsv from real demo runs (redacted appropriately)
4.3 Content and SEO strategy
Target the terms buyers are already searching before they know AutoOrg exists.

Primary keyword clusters
text

CLUSTER 1: AI governance
  ai governance framework
  ai audit trail
  llm output auditing
  ai compliance enterprise
  ai system observability

CLUSTER 2: AI testing/evaluation
  llm regression testing
  ai benchmark framework
  prompt regression detection
  ai output quality measurement
  llm evaluation pipeline

CLUSTER 3: Multi-agent systems
  multi-agent orchestration production
  autonomous agent governance
  ai agent approval workflow
  multi-agent reliability

CLUSTER 4: Enterprise AI
  enterprise ai reliability
  ai system trust
  llm production deployment
  ai risk management
Content format priority
text

FORMAT                  WHY IT WORKS FOR THIS AUDIENCE
──────────────────────────────────────────────────────────────────────
Technical deep dives    Engineers read and share; "how we built X"
  (2,000–4,000 words)   articles drive the most qualified traffic

Benchmark reports       Establishes credibility; journalists cite them;
  (data-driven)         "State of Autonomous AI Quality" annual report

Comparison posts        Intercepts evaluation-stage buyers; honest
  (vs alternatives)     comparisons drive trust more than self-promotion

Tutorial sequences      Converts readers to trial users; each tutorial
  (build X with         should end at a natural upgrade point
   AutoOrg)

Case studies            Converts enterprise buyers; must have hard
  (customer-named)      numbers; "reduced review cycles by 60%"
4.4 Direct outbound (founder-led)
In the first 12 months, the founder should run all sales conversations personally.
This is not optional. It is the fastest PMF learning loop available.

Outbound targeting
text

SIGNAL                           ACTION
────────────────────────────────────────────────────────────────────
Job posting for "AI governance"  Outbound: they have the problem
Job posting for "LLM eval"       Outbound: they have the problem
Blog post about "AI reliability" Warm introduction request
GitHub star on AutoOrg or peers  Personal outreach from founder
Conference talk about AI risk    Follow up with technical content
LinkedIn post about AI audit     Direct message with relevant resource
Outbound message framework
Do not use a template. Use this framework:

text

LINE 1: Acknowledge something specific they wrote or built.
LINE 2: Name the exact problem in their terms, not your terms.
LINE 3: One sentence on what AutoOrg does.
LINE 4: Ask one specific question, not for a demo.
Example:

text

Subject: your AI reliability post

Saw your post about LLM outputs regressing after prompt changes.
That "feels better but might not be better" problem is exactly why
our team built AutoOrg — it's a benchmark gate that blocks deployment
when quality drops, similar to a CI system for LLM output.

Curious: how are you currently detecting when a prompt change
regressed something?
This is not a cold email. It is a specific, informed question from a peer.

4.5 Partner integrations
Tier 1 partners (highest leverage, pursue first)
text

PARTNER             INTEGRATION             VALUE
────────────────────────────────────────────────────────────────
Anthropic           Built with Claude badge  Trust signal + distribution
                    Cookbook inclusion       Developer discovery
                    Partner directory        Enterprise referrals

OpenAI              Works with GPT-4.1       Reach OpenAI users
                    Cookbook inclusion       Developer discovery

GitHub              GitHub Actions native    CI integration story
                    Marketplace listing      Organic distribution
                    Copilot extension hook   Future: inline governance
Tier 2 partners (pursue after $1M ARR)
text

PARTNER             INTEGRATION             VALUE
────────────────────────────────────────────────────────────────
Datadog             Observability export     Enterprise monitoring story
Snowflake           Run history export       Data team buyers
Notion              org.md editor plugin     Knowledge management buyers
Atlassian           GitHub/Jira connector    Enterprise workflow buyers
AWS/GCP/Azure       Marketplace listing      Enterprise procurement path
PART 5: SALES MOTION
5.1 Sales stages
text

STAGE         DEFINITION                        TARGET DURATION
──────────────────────────────────────────────────────────────────
Awareness     Prospect discovers AutoOrg         —
              via GitHub, content, or referral

Interest      Prospect stars repo or joins       Day 1–7
              Discord; reads docs

Evaluation    Prospect installs locally and      Day 7–30
              runs a cycle; asks technical
              questions; reads benchmark docs

Trial close   Prospect asks about team plan;     Day 30–60
              Champion does internal pitch

Legal/sec     Security review; data questions;   Day 60–90
              DPA/BAA if required

Close         Contract signed; workspace         Day 90–120
              provisioned

Expand        Additional workspaces/features;    Month 4–12
              portfolio activation; enterprise
              upgrade
5.2 The technical evaluation playbook
Most AutoOrg deals are won or lost during the evaluation phase.
The champion is an engineer who needs to prove internal value.
Help them do that.

Evaluation support kit
Provide this proactively at first technical contact:

text

EVALUATION KIT CONTENTS
────────────────────────────────────────────────────────────────
1. Quickstart (< 20 min to first working run)
2. 3 example use cases with pre-built org.md + constitution.md
3. Benchmark suite runner with example results
4. "How to present this internally" slide template (3 slides)
5. Comparison doc: AutoOrg vs DIY agent pipeline (honest)
6. Security FAQ (data handling, no training on data, redaction)
7. Slack DM with founder for evaluation questions
Evaluation success criteria
Help the champion define success before they start:

text

"By the end of your evaluation, you should be able to answer:
1. Did AutoOrg produce better output than your baseline after 10 cycles?
2. Can you see what it did and why it made each decision?
3. Did the benchmark gate catch at least one quality regression?
4. Would you trust this to run unattended for 8 hours?"
If they can answer yes to all four, the internal pitch is already written.

5.3 Handling the security and compliance review
The CISO and compliance teams will raise predictable objections. Prepare the champion to answer them.

text

OBJECTION                          ANSWER
──────────────────────────────────────────────────────────────────────
"How do we know what the AI did?"  Every action is in the action ledger.
                                   Every artifact is signed and verifiable.
                                   Export the security audit bundle.

"Does AutoOrg train on our data?"  No. AutoOrg calls your LLM APIs.
                                   Your data goes to Anthropic/OpenAI
                                   under your existing agreements.
                                   AutoOrg does not see your prompts.

"What about PII in AI outputs?"    Redaction filter runs before any
                                   text is persisted. Redaction events
                                   are logged. You can configure the
                                   redaction rules.

"Can the AI modify itself?"        Only through the learning loop,
                                   which requires benchmark simulation
                                   + human approval before activation.
                                   No self-modification without approval.

"What if it does something wrong?" Every dangerous action requires
                                   approval before execution. Reversible
                                   actions have compensation records.
                                   The action ledger shows every step.

"Where does our data live?"        On your infrastructure. Self-hosted
                                   option available. We never see your
                                   run data unless you share it for
                                   support purposes.
5.4 Pricing conversation guide
text

QUESTION                        RESPONSE
──────────────────────────────────────────────────────────────────────
"Why not just use LangChain     LangChain is a library for building
or CrewAI?"                     agents. AutoOrg is a governance layer
                                for running them in production. They
                                are not competitors. You could wrap
                                LangChain inside an AutoOrg worker.

"What does $800/month get me    One workspace with full governance:
vs just using the API?"         strict approval blocking, signed
                                artifacts, benchmark regression
                                detection, evidence packs,
                                provenance chain, and dashboard.
                                The API alone gets you a loop.
                                We get you a loop you can prove.

"Can we try before we buy?"     Yes. The open-source version is
                                fully functional for single-user local
                                use. For team evaluation, we offer a
                                30-day Team trial with full features.

"We need enterprise pricing."   Enterprise starts at $X/year for one
                                workspace. Volume discounts at 3+
                                workspaces. Annual billing only for
                                enterprise. Let's scope your footprint.

"What's the ROI?"               Frame it in their terms:
                                If this catches 1 quality regression
                                before it reaches production, what is
                                that worth? If it runs 8 hours of
                                research autonomously and needs 30min
                                of review vs 8 hours of analyst time,
                                what is that worth?
PART 6: LAUNCH PLAN
6.1 Pre-launch (now → launch day)
text

WEEK -8 TO -5: Foundation
  □ README rewritten with problem-first framing
  □ 5-minute quickstart working end-to-end
  □ 3 example use cases with org.md + constitution.md
  □ Benchmark leaderboard page live (public demo results)
  □ Discord server live with welcome flow
  □ Email capture on landing page
  □ First 3 long-form technical blog posts drafted

WEEK -4 TO -2: Community seeding
  □ 20 friends/colleagues run the quickstart and give feedback
  □ Fix top 5 friction points from feedback
  □ Reach out to 10 AI engineers you respect; ask for honest review
  □ Secure 2–3 design partners (use the product free + give feedback)
  □ Record demo video (5 min; real run; not slides)
  □ Get written quotes from design partners

WEEK -1: Launch prep
  □ Hacker News Show HN draft written and peer-reviewed
  □ ProductHunt page prepared (do not publish yet)
  □ Twitter/X thread written (technical thread, not marketing)
  □ Email list ready for Day 1 send
  □ Monitoring in place for GitHub issues, Discord, email
  □ Founder has cleared calendar for 48 hours of launch support
6.2 Launch week
text

DAY 1: MONDAY — Hacker News

  08:00 UTC    Post Show HN: "AutoOrg – an autonomous org runtime
               with a benchmark gate, evidence packs, and approval-
               gated commits"

               Title is technical and specific. Not hype.
               Comments are the product. Respond to everything.

  Same day     Twitter/X technical thread (link to HN, GitHub)

  Same day     Email to waitlist: "we launched, here's the quickstart"

  Same day     Post in 3–5 relevant Discord/Slack communities
               (AI engineers Slack, Latent Space Discord, etc.)


DAY 2: TUESDAY — GitHub push

  Reach out to 5 newsletters:
    - The Batch (Andrew Ng)
    - TLDR AI
    - Latent Space
    - The Pragmatic Engineer
    - Import AI (Jack Clark)

  Target: "here is something technically interesting we built.
           Not asking you to cover it. Just wanted you to see it."


DAY 3: WEDNESDAY — Community follow-up

  Respond to all GitHub issues and Discord questions from Day 1.
  Write a "Day 1 lessons" short post (honest, technical).
  DM the 10 most technically engaged HN commenters.


DAY 5: FRIDAY — Outbound begins

  Start the first 20 outbound messages using the framework above.
  Target: job postings for "AI governance" and "LLM evaluation."
  Target: people who engaged with the HN post but didn't reach out.
6.3 Post-launch growth phases
Phase 1: Discovery (Month 1–3)
text

GOAL: 500 GitHub stars, 50 Discord members, 5 paying customers

ACTIVITIES
  □ Weekly: respond to every GitHub issue within 24 hours
  □ Weekly: publish one technical post (benchmark results, architecture)
  □ Weekly: 10 personalized outbound messages
  □ Monthly: community office hours call
  □ Monthly: "what we shipped" update post

METRICS TO WATCH
  → GitHub stars (growth rate, not absolute)
  → Discord DAU
  → Trial workspace activations
  → Quickstart completion rate (install → first run)
  → Conversion: GitHub star → Discord → trial → paid
Phase 2: Traction (Month 3–6)
text

GOAL: $50K MRR, 20 paying customers, 1 design partner case study

ACTIVITIES
  □ Convert 2–3 design partners to paid accounts
  □ Publish first customer case study (anonymized if needed)
  □ Submit to Anthropic and OpenAI partner directories
  □ Speak at one AI conference (NeurIPS, AI Engineer World's Fair, etc.)
  □ Launch community template marketplace (free templates drive signups)
  □ Start writing "State of Autonomous AI Quality" annual report

METRICS TO WATCH
  → MRR and MRR growth rate
  → Net Revenue Retention (expansion signals)
  → Time from signup to first paid workspace
  → Churn (monthly; should be < 3% at this stage)
  → NPS (survey design partner accounts)
Phase 3: Scale (Month 6–12)
text

GOAL: $200K MRR, 80 customers, 3 enterprise contracts

ACTIVITIES
  □ Hire first sales engineer (technical, not quota-carrying yet)
  □ Hire first content/developer relations person
  □ Publish "State of Autonomous AI Quality" report (press outreach)
  □ Launch enterprise tier formally
  □ Start SOC 2 Type II process (12-month lead time for enterprise)
  □ First analyst briefing (Gartner, Forrester — "for awareness, not coverage")
  □ Partner integration launches (GitHub Actions native, Anthropic partner page)

METRICS TO WATCH
  → Enterprise pipeline (ACV, stage distribution)
  → Payback period
  → CAC by channel
  → Expansion revenue as % of total new revenue
PART 7: COMPETITIVE POSITIONING
7.1 Competitive landscape
text

CATEGORY            PLAYERS                 POSITION VS AUTOORG
──────────────────────────────────────────────────────────────────────
Agent frameworks    LangChain, LlamaIndex,  Building blocks, not
                    CrewAI, AutoGen         governed production systems.
                                            AutoOrg is a layer above these,
                                            not a replacement.

LLM eval tools      Langfuse, Braintrust,   Evaluation of individual calls.
                    PromptLayer, Helicone   AutoOrg evaluates the full
                                            multi-cycle autonomous work
                                            system, not individual prompts.

AI workflow         Flowise, Dify,          Visual builders; limited
  builders          Coze, n8n               governance; no benchmark gate;
                                            no approval-gated commits.

AI governance       Fairly Labs, Credo AI,  Focus on model fairness/bias.
  (fairness)        Fiddler                 AutoOrg focuses on output
                                            quality governance and
                                            operational safety.

Robotic Process     UiPath, Automation      Legacy UI scraping. Completely
  Automation        Anywhere                different abstraction. Different
                                            buyer. Different problem.

Enterprise AI       Salesforce Einstein,    Vertical-specific; closed;
  platforms         Microsoft Copilot,      not composable. AutoOrg is
                    ServiceNow AI           horizontal infrastructure.
7.2 Positioning against the top three competitors
vs LangChain
text

LANGCHAIN                              AUTOORG
──────────────────────────────────────────────────────────────────────
Library for building agents            Runtime for governing autonomous work
No benchmark gate                      Built-in benchmark regression detection
No approval workflow                   Approval-gated commits
No evidence packs                      Claims must be backed by evidence
No signed artifacts                    Every artifact is signed + verifiable
No policy engine                       Policy engine in critical path
Community of builders                  Community of operators
Good for: prototyping                  Good for: production

TALKING POINT:
"LangChain is excellent for building an agent.
 AutoOrg is what you add when you need to run that agent
 in production with governance, auditability, and proof
 that it is improving over time."
vs Langfuse / Braintrust
text

LANGFUSE / BRAINTRUST                  AUTOORG
──────────────────────────────────────────────────────────────────────
Traces individual LLM calls            Governs the full autonomous work loop
Evaluation of prompts in isolation     Evaluation of multi-cycle systems
No autonomous execution                Full orchestration runtime
No ratchet / commit decision           Monotonic improvement guarantee
No approval gate                       Approval-gated commits
No portfolio / learning loop           Portfolio + bounded learning
Excellent observability tools          Observability + control plane

TALKING POINT:
"Langfuse tells you what happened.
 AutoOrg decides what to commit, enforces what is allowed,
 and gates what gets deployed — not just what gets logged."
vs DIY pipeline
text

DIY MULTI-AGENT PIPELINE               AUTOORG
──────────────────────────────────────────────────────────────────────
6 months to build                      Day 1 to running loop
No benchmark history                   Benchmark suite + results.tsv
No approval gate                       Phase 5.1 approval blocking
No evidence packs                      Phase 6 tool traces + evidence
No policy engine                       Phase 6.1 policy + ledger
No portfolio comparison                Phase 8 portfolio orchestration
No self-improvement                    Phase 10 learning loop
Full control                           Full control + governance

TALKING POINT:
"You can build all of this. You probably should not.
 Every month your team spends building a governance framework
 is a month they are not working on the application layer.
 AutoOrg is the governance framework. Your team owns the mission."
7.3 The moat
AutoOrg's defensibility comes from three compounding factors:

text

MOAT FACTOR 1: Architecture coherence
  Every layer from Phase 5.1 through Phase 10 is designed to work
  together. The ratchet, approval gate, evidence packs, provenance chain,
  policy engine, benchmark suite, and learning loop form one system.
  Copying any single piece does not replicate the whole.

MOAT FACTOR 2: Benchmark data network effect
  Every customer running benchmarks produces data that can improve
  the judge calibration, gold expectations, and scoring models.
  More customers → better benchmarks → better product → more customers.
  This is a data flywheel that takes time to accumulate.

MOAT FACTOR 3: Constitution as organizational memory
  Once an organization has written their constitution.md and run it
  through 1,000 cycles, they have trained a scoring harness tuned to
  their specific standards. That is expensive to recreate elsewhere.
  This creates switching cost at the organizational knowledge level,
  not just at the data layer.
PART 8: METRICS AND MILESTONES
8.1 North star metric
text

NORTH STAR: Weekly Governed Autonomous Work Hours

Definition: Sum across all active workspaces of hours spent
            in autonomous daemon mode with at least one
            completed cycle per hour, where strictApprovalBlocking
            is enabled.

Why this metric:
  → It measures customers actually running AutoOrg in production
    (not just using the dashboard)
  → It is directly tied to the value proposition
  → It is hard to game (you can't fake daemon hours)
  → It correlates with willingness to pay (customers who run
    AutoOrg more trust it more and expand more)
8.2 Milestone map
text

MILESTONE                       TARGET          WHAT IT PROVES
──────────────────────────────────────────────────────────────────────
M1: First external run          Week 2          Product works for strangers
  First person outside the
  team completes a full cycle

M2: 10 GitHub stars/day         Month 1         Developer discovery is working
  Sustained organic interest

M3: First paying customer       Month 2         Someone will pay for this
  $800/month Team plan

M4: 5 paying customers          Month 3         Repeatability exists
  $4,000 MRR

M5: First expansion             Month 4         Product creates value
  Existing customer upgrades
  or adds a workspace

M6: $10K MRR                   Month 4–5       Early PMF signal
  12–13 paying customers

M7: First enterprise contract   Month 6         Can sell to large orgs
  $30K+ ACV

M8: $50K MRR                   Month 6–8       Traction confirmed
  ~50 paying customers

M9: Net Revenue Retention > 110%  Month 8      Expansion engine working
  Customers expand faster
  than they churn

M10: $200K MRR                 Month 10–12     Scale phase begins
   ~80–100 paying customers
   3–5 enterprise contracts

M11: $1M ARR                   Month 14–18     Series A trigger point
   Design partner case studies
   SOC 2 Type II in progress
   Partner integrations live
8.3 Key ratios to track weekly
text

METRIC                        TARGET          ALARM
──────────────────────────────────────────────────────────────────────
GitHub star → Discord join    > 15%           < 5%  (discovery problem)
Discord join → trial          > 20%           < 8%  (activation problem)
Trial → paid                  > 12%           < 5%  (value problem)
Trial duration to convert     < 21 days       > 45  (friction problem)
Monthly churn (revenue)       < 2.5%          > 5%  (retention problem)
NRR (net revenue retention)   > 110%          < 100% (expansion problem)
Payback period (CAC)          < 6 months      > 12  (unit economics problem)
Support ticket per customer   < 1.5/month     > 4   (product problem)
8.4 Fundraising posture
text

SEED (raise now or in 3 months)
  Target: $1.5M–$3M
  Use: 18 months of runway for 3–4 person team
  Thesis: AI governance is a category. AutoOrg owns the definition.
  Metrics needed: 5 paying customers, $10K MRR or clear path to it
  Story: "We built the thing that makes autonomous AI safe to run
          in production. The governance gap is real. Here's the moat."

SERIES A (month 12–18)
  Target: $8M–$15M
  Use: GTM team (sales, marketing, partnerships), SOC 2, enterprise
  Metrics needed: $1M ARR, NRR > 110%, 2–3 enterprise contracts,
                  benchmark data flywheel showing (leaderboard traffic)
  Story: "Governed Autonomous Work is a category. AutoOrg is #1.
          Here is the expansion plan and why the moat deepens."
PART 9: THE FOUNDING NARRATIVE
Every pitch, investor deck, sales call, blog post, and conference talk should return to the same core story. Internalize this.

text

THE STORY IN THREE SENTENCES

AI can now do real knowledge work. Nobody trusts it in production.
AutoOrg is the governance layer that closes the gap between
impressive AI demos and auditable, benchmarked, production-ready
autonomous systems — by building the ratchet, the approval gate,
the evidence trail, and the benchmark history that every responsible
organization needs before they will actually run AI unattended.

THE ENEMY

The enemy is not another company. The enemy is the governance gap —
the space between "this demo looks amazing" and "we can actually
deploy this, prove it works, and prove it's getting better."

Every organization that has tried AI and pulled it back because
they couldn't trust it, audit it, or measure it — that is the
market. That is who AutoOrg is for.

THE PROOF

The proof is in the architecture. Not slides. Not testimonials.
The action ledger, signed artifacts, benchmark regression detection,
approval-gated commits, and bounded learning loop are the proof.
Show the code. Show the results.tsv. Show the benchmark leaderboard.
The governance story is the product story.
This GTM strategy is a living document. Revisit it at each milestone and update the ICP, pricing, and channel mix based on what the data shows, not what sounds right in a deck.




Here is the complete canonical orchestrator with every phase patch merged into one coherent file.


/**
 * AutoOrg — Canonical Orchestrator
 * src/runtime/orchestrator.ts
 *
 * This is the single source of truth for the main autonomous loop.
 * All phase patches (5, 5.1, 6, 6.1, 7, 8, 9, 10) are merged here.
 *
 * Initialization sequence:
 *   1. Load config + feature flags
 *   2. Boot DB + write run record
 *   3. Write signed run manifest
 *   4. Seed policies (tool + action)
 *   5. Acquire workspace lock
 *   6. Attempt crash recovery
 *   7. Boot knowledge graph
 *   8. Boot memory
 *   9. Boot teams (if hierarchy mode)
 *  10. Enter main cycle loop
 *  11. Graceful shutdown
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import simpleGit from 'simple-git';

// Config
import { featureFlag } from '@/config/feature-flags.js';
import type { RunConfig, RatchetScore, ModelConfig } from '@/types/index.js';

// DB
import { getDb } from '@/db/migrate.js';

// Core runtime
import { RatchetEngine } from '@/runtime/ratchet.js';
import { ApprovalGate } from '@/runtime/approval-gate.js';
import { ApprovalEnforcer } from '@/runtime/approval-enforcer.js';
import { DreamEngine } from '@/runtime/dream.js';
import { ResultsLogger } from '@/runtime/results-logger.js';
import { TranscriptWriter } from '@/runtime/transcript.js';
import { EventBus } from '@/runtime/event-bus.js';
import { AgentRunner } from '@/runtime/agent-runner.js';

// Phase 5 — Memory + graph + coordinator
import { MemoryManager } from '@/runtime/memory-manager.js';
import { graphManager } from '@/runtime/graph-manager.js';
import { TeamManager } from '@/runtime/team-manager.js';
import { UltraPlanEngine } from '@/runtime/ultraplan.js';

// Phase 5.1 — Hardening
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { RecoveryJournal } from '@/runtime/recovery-journal.js';
import { recoverInterruptedRun } from '@/runtime/crash-recover.js';
import { LeaseManager } from '@/runtime/lease-manager.js';
import { BudgetManager } from '@/runtime/budget-manager.js';
import { TeamMemoryPartitions } from '@/runtime/memory-partitions.js';
import { UltraPlanSla } from '@/runtime/ultraplan-sla.js';
import { IncidentLog } from '@/runtime/incident-log.js';

// Phase 6 — Tool substrate
import { bootstrapRegistry } from '@/tools/bootstrap.js';
import { ToolPolicy } from '@/tools/tool-policy.js';
import { EvidencePackBuilder } from '@/tools/evidence-pack.js';
import { VerificationAuditor } from '@/runtime/verification-auditor.js';

// Phase 6.1 — Governance
import { PolicyEngine } from '@/runtime/policy-engine.js';
import { ActionLedger } from '@/runtime/action-ledger.js';
import { ProvenanceBuilder } from '@/runtime/provenance.js';
import { PolicyAuditor } from '@/runtime/policy-auditor.js';
import { SecurityAudit } from '@/runtime/security-audit.js';
import { RedactionFilter } from '@/runtime/redaction.js';
import { RunManifestWriter } from '@/runtime/run-manifest.js';

// Phase 10 — Learning overlays
import { VersionManager } from '@/learning/version-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  // Core mission
  orgText: string;
  constitutionText: string;
  missionCategory?: string;

  // Run control
  maxCycles?: number;
  plateauCycles?: number;
  seed?: number;
  mode?: 'normal' | 'benchmark' | 'portfolio';

  // Workspace
  workspaceRoot?: string;
  workspaceId?: string;
  tenantId?: string;
  portfolioVariantId?: string;

  // Models
  modelMap?: Record<string, string>;
  models?: {
    ceo?: string;
    engineer?: string;
    critic?: string;
    archivist?: string;
    devilsAdvocate?: string;
    ratchetJudge?: string;
    coordinator?: string;
    dream?: string;
  };

  // Variants
  constitutionVariant?: string;
  templateVariant?: string;

  // Budget
  maxBudgetUsd?: number;

  // Hierarchy
  useHierarchy?: boolean;

  // ULTRAPLAN
  ultraplanMaxDurationMs?: number;
  ultraplanCheckpointIntervalMs?: number;

  // Graph
  graphSeedMaterial?: string[];

  // Feature flags override (for testing)
  featureFlagsOverride?: Record<string, boolean>;

  // Benchmark context
  benchmarkCase?: {
    caseName: string;
    category: string;
    difficulty: string;
  };
}

export interface OrchestratorResult {
  runId: string;
  finalOutputText: string;
  finalOutputPath?: string;
  finalScore: RatchetScore;
  totalCostUsd: number;
  totalToolCalls: number;
  totalCycles: number;
  evidencePackId?: string;
  verificationReport?: unknown;
  provenanceReport?: unknown;
  securityFindingCount: number;
  stoppedReason: 'max_cycles' | 'plateau' | 'budget_exhausted' | 'stop_condition' | 'error';
}

interface RunState {
  bestScore: number;
  plateauCount: number;
  consecutiveRejects: number;
  totalCostUsd: number;
  totalToolCalls: number;
  lastEvidencePackId?: string;
  lastVerificationReport?: unknown;
  lastProvenanceReport?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_CYCLES = 20;
const DEFAULT_PLATEAU_CYCLES = 5;
const DEFAULT_MODELS = {
  ceo: 'claude-opus-4',
  engineer: 'claude-sonnet-4-5',
  critic: 'claude-sonnet-4-5',
  archivist: 'claude-sonnet-4-5',
  devilsAdvocate: 'gpt-4.1',
  ratchetJudge: 'claude-opus-4',
  coordinator: 'claude-sonnet-4-5',
  dream: 'claude-sonnet-4-5',
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoOrg(config: OrchestratorConfig): Promise<OrchestratorResult> {

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: Resolve config
  // ──────────────────────────────────────────────────────────────────────────

  const root = config.workspaceRoot ?? process.cwd();
  const workspaceFile = path.join(root, 'workspace', 'current_output.md');
  const resultsFile = path.join(root, 'results.tsv');

  const maxCycles = config.maxCycles ?? DEFAULT_MAX_CYCLES;
  const plateauCycles = config.plateauCycles ?? DEFAULT_PLATEAU_CYCLES;

  const models = {
    ...DEFAULT_MODELS,
    ...(config.models ?? {}),
    ...(config.modelMap ?? {}),
  };

  const runId = `run_${nanoid(12)}`;

  const git = simpleGit(root);
  const eventBus = new EventBus();
  const incidents = new IncidentLog();

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: DB — write run record
  // ──────────────────────────────────────────────────────────────────────────

  const db = getDb();
  db.prepare(`
    INSERT INTO runs
    (id, tenant_id, workspace_id, status, mode, mission_summary,
     constitution_variant, template_variant, model_map_json,
     portfolio_variant_id, benchmark_case_json, created_at)
    VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    runId,
    config.tenantId ?? null,
    config.workspaceId ?? null,
    config.mode ?? 'normal',
    config.orgText.slice(0, 500),
    config.constitutionVariant ?? 'default',
    config.templateVariant ?? 'baseline',
    JSON.stringify(models),
    config.portfolioVariantId ?? null,
    config.benchmarkCase ? JSON.stringify(config.benchmarkCase) : null,
  );
  db.close();

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3: Workspace directories
  // ──────────────────────────────────────────────────────────────────────────

  await mkdir(path.join(root, 'workspace'), { recursive: true });
  await mkdir(path.join(root, 'memory'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'tools', 'outputs'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'evidence', 'packs'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'evidence', 'merged'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'approvals', 'pending'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'approvals', 'materialized'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'manifests'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'security', 'findings'), { recursive: true });
  await mkdir(path.join(root, 'artifacts', 'provenance', 'reports'), { recursive: true });

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 4: Signed run manifest (Phase 6.1)
  // ──────────────────────────────────────────────────────────────────────────

  let gitHead = '';
  try {
    gitHead = (await git.revparse(['HEAD'])).trim();
  } catch {}

  if (featureFlag('artifactSigning')) {
    const manifestWriter = new RunManifestWriter();
    await manifestWriter.write(runId, {
      mode: config.mode ?? 'normal',
      constitutionVariant: config.constitutionVariant ?? 'default',
      templateVariant: config.templateVariant ?? 'baseline',
      models,
      gitHead,
      maxCycles,
      portfolioVariantId: config.portfolioVariantId ?? null,
      benchmarkCase: config.benchmarkCase ?? null,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 5: Initialize hardening engines (Phase 5.1)
  // ──────────────────────────────────────────────────────────────────────────

  const approvalGate = new ApprovalGate();
  const approvalEnforcer = new ApprovalEnforcer(runId);
  const workspaceLock = new WorkspaceLock();
  const recoveryJournal = new RecoveryJournal(runId);
  const leaseManager = new LeaseManager(runId);
  const budgetManager = new BudgetManager(runId);
  const partitions = new TeamMemoryPartitions(runId);
  const ultraplanSla = new UltraPlanSla(runId);

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 6: Initialize governance engines (Phase 6.1)
  // ──────────────────────────────────────────────────────────────────────────

  const policyEngine = new PolicyEngine(runId);
  const actionLedger = new ActionLedger(runId);
  const evidencePacks = new EvidencePackBuilder(runId);
  const verifier = new VerificationAuditor(runId);
  const provenanceBuilder = new ProvenanceBuilder(runId);
  const policyAuditor = new PolicyAuditor(runId);
  const securityAudit = new SecurityAudit(runId);
  const redactor = new RedactionFilter(runId);

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 7: Initialize tool substrate (Phase 6)
  // ──────────────────────────────────────────────────────────────────────────

  const toolRegistry = bootstrapRegistry();
  const toolPolicy = new ToolPolicy(runId);

  if (featureFlag('toolPolicies')) {
    toolPolicy.seedDefaults();
  }

  if (featureFlag('policyEngine')) {
    policyEngine.seedDefaults();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 8: Initialize learning version overlays (Phase 10)
  // ──────────────────────────────────────────────────────────────────────────

  const versionManager = new VersionManager();

  const getEffectiveModelMap = () => {
    if (!featureFlag('routingOptimization')) return models;
    const activeRouting = versionManager.getActiveRouting();
    if (!activeRouting?.config_json) return models;

    try {
      const cfg = JSON.parse(activeRouting.config_json);
      const rule = cfg.rules?.find((r: any) =>
        r.mission_category === (config.missionCategory ?? 'general') ||
        r.mission_category === '*'
      );
      return rule?.model_map
        ? { ...models, ...rule.model_map }
        : models;
    } catch {
      return models;
    }
  };

  const getEffectivePrompt = (roleKey: string, fallbackPath: string) => {
    if (!featureFlag('promptOptimization')) return null;
    return versionManager.getActivePrompt(`role:${roleKey}`)?.content ?? null;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 9: Acquire workspace lock (Phase 5.1)
  // ──────────────────────────────────────────────────────────────────────────

  const lockKey = `worktree:${root}`;
  const lockHolder = `run:${runId}`;

  if (featureFlag('workspaceLocks')) {
    workspaceLock.acquire(lockKey, lockHolder, runId, 90_000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 10: Crash recovery (Phase 5.1)
  // ──────────────────────────────────────────────────────────────────────────

  const runState: RunState = {
    bestScore: 0,
    plateauCount: 0,
    consecutiveRejects: 0,
    totalCostUsd: 0,
    totalToolCalls: 0,
  };

  if (featureFlag('daemonRecovery')) {
    const recovered = await recoverInterruptedRun(runId);
    if (recovered) {
      runState.bestScore = recovered.bestScore ?? 0;
      runState.plateauCount = recovered.plateauCount ?? 0;
      runState.consecutiveRejects = recovered.consecutiveRejects ?? 0;
      incidents.log({
        runId,
        severity: 'info',
        component: 'orchestrator',
        summary: `Resumed from checkpoint at stage=${recovered.stage}, cycle=${recovered.cycleNumber}`,
        details: recovered,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 11: Boot knowledge graph
  // ──────────────────────────────────────────────────────────────────────────

  graphManager.init(runId);

  if (featureFlag('knowledgeGraph')) {
    await graphManager.ensureBuilt({
      seedMaterial: config.graphSeedMaterial ?? [],
      workspaceRoot: root,
    }).catch((err: Error) => {
      incidents.log({
        runId,
        severity: 'warn',
        component: 'graph-manager',
        summary: `Graph build failed: ${err.message}`,
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 12: Boot memory
  // ──────────────────────────────────────────────────────────────────────────

  const memory = new MemoryManager(root);
  await memory.ensureInitialized();

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 13: Boot teams (Phase 5 — hierarchy mode)
  // ──────────────────────────────────────────────────────────────────────────

  const teamManager = new TeamManager(runId);
  let teamIds: Record<string, string> = {};

  if (featureFlag('coordinatorHierarchy') && config.useHierarchy !== false) {
    const defaultTeams = ['Research', 'Quality', 'Planning', 'Memory', 'Platform'];

    for (const teamName of defaultTeams) {
      const team = await teamManager.createTeam({
        name: teamName,
        runId,
      });
      teamIds[teamName] = team.teamId;

      if (featureFlag('teamMemoryPartitions')) {
        await partitions.ensureTeamPartition(team.teamId, teamName);
      }

      if (featureFlag('teamBudgets')) {
        budgetManager.seedDefaults(team.teamId, {
          usdLimit: teamName === 'Planning' ? 2.5 : 1.25,
          tokenLimit: teamName === 'Planning' ? 60_000 : 30_000,
          toolCallLimit: 40,
          minuteLimit: teamName === 'Planning' ? 30 : 15,
        });

        if (featureFlag('toolPolicies')) {
          toolPolicy.seedDefaults(team.teamId);
        }

        if (featureFlag('policyEngine')) {
          policyEngine.seedDefaults(team.teamId);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 14: Boot core subsystems
  // ──────────────────────────────────────────────────────────────────────────

  const effectiveModels = getEffectiveModelMap();

  const ratchet = new RatchetEngine({
    constitution: config.constitutionText,
    runId,
    models: effectiveModels,
    benchmarkCase: config.benchmarkCase,
  });

  const resultsLogger = new ResultsLogger(resultsFile, runId);
  await resultsLogger.ensureHeader();

  const transcriptWriter = new TranscriptWriter(runId, root);
  await transcriptWriter.ensureInitialized();

  const ultraPlanEngine = new UltraPlanEngine(runId, {
    models: effectiveModels,
    constitution: config.constitutionText,
  });

  const dreamEngine = new DreamEngine(runId, {
    model: effectiveModels.dream ?? DEFAULT_MODELS.dream,
    memoryRoot: path.join(root, 'memory'),
  });

  // Write boot checkpoint
  recoveryJournal.checkpoint({
    cycleNumber: 0,
    bestScore: runState.bestScore,
    plateauCount: runState.plateauCount,
    consecutiveRejects: runState.consecutiveRejects,
    stage: 'boot',
    extra: { gitHead, teamCount: Object.keys(teamIds).length },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 15: Graceful shutdown registration
  // ──────────────────────────────────────────────────────────────────────────

  let shutdownRequested = false;

  const onShutdown = () => {
    shutdownRequested = true;
    try {
      if (featureFlag('workspaceLocks')) {
        workspaceLock.release(lockKey, lockHolder);
      }
    } finally {
      const db2 = getDb();
      db2.prepare(`
        UPDATE runs SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?
      `).run(runId);
      db2.close();
      process.exit(0);
    }
  };

  process.once('SIGINT', onShutdown);
  process.once('SIGTERM', onShutdown);

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 16: MAIN CYCLE LOOP
  // ──────────────────────────────────────────────────────────────────────────

  let cycleNumber = 0;
  let stoppedReason: OrchestratorResult['stoppedReason'] = 'max_cycles';

  try {
    for (cycleNumber = 1; cycleNumber <= maxCycles; cycleNumber++) {
      if (shutdownRequested) {
        stoppedReason = 'error';
        break;
      }

      // ── Budget guard ───────────────────────────────────────────────────────
      if (
        config.maxBudgetUsd !== undefined &&
        runState.totalCostUsd >= config.maxBudgetUsd
      ) {
        stoppedReason = 'budget_exhausted';
        incidents.log({
          runId,
          severity: 'warn',
          component: 'orchestrator',
          summary: `Budget exhausted at $${runState.totalCostUsd.toFixed(4)}`,
        });
        break;
      }

      // ── Workspace lock heartbeat ───────────────────────────────────────────
      if (featureFlag('workspaceLocks')) {
        workspaceLock.heartbeat(lockKey, lockHolder, 90_000);
      }

      // ── Worker lease reclaim ───────────────────────────────────────────────
      if (featureFlag('workerLeases')) {
        leaseManager.reclaimExpired();
      }

      // ── Pre-cycle checkpoint ───────────────────────────────────────────────
      recoveryJournal.checkpoint({
        cycleNumber,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
        consecutiveRejects: runState.consecutiveRejects,
        stage: 'pre_cycle',
      });

      // ── Write cycle DB record ──────────────────────────────────────────────
      const cycleId = `cyc_${nanoid(10)}`;
      const db3 = getDb();
      db3.prepare(`
        INSERT INTO cycles
        (id, run_id, cycle_number, status, started_at)
        VALUES (?, ?, ?, 'running', datetime('now'))
      `).run(cycleId, runId, cycleNumber);
      db3.close();

      transcriptWriter.event({
        type: 'cycle_start',
        cycleNumber,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
      });

      // ── Load context ───────────────────────────────────────────────────────

      const graphContext = featureFlag('knowledgeGraph')
        ? graphManager.buildContext(config.orgText)
        : '';

      const sharedMemoryContext = await memory.buildContext();

      const workspaceText = await readFile(workspaceFile, 'utf-8').catch(() => '');

      // ── ULTRAPLAN (plateau recovery) ──────────────────────────────────────
      if (
        featureFlag('ultraplan') &&
        runState.plateauCount >= Math.max(3, Math.floor(plateauCycles * 0.6)) &&
        runState.plateauCount < plateauCycles
      ) {
        const ultraSession = await ultraPlanEngine.createSession({
          cycleNumber,
          currentBestScore: runState.bestScore,
          plateauCount: runState.plateauCount,
          mission: config.orgText,
          workspaceText,
          graphContext,
          memoryContext: sharedMemoryContext,
        });

        if (featureFlag('ultraplanSla')) {
          const ultraResult = await ultraplanSla.runWithSla({
            sessionId: ultraSession.sessionId,
            cycleNumber,
            maxDurationMs: config.ultraplanMaxDurationMs ?? 15 * 60 * 1000,
            onRun: async () => {
              return await ultraPlanEngine.executeSession(ultraSession.sessionId);
            },
            onTimeout: async () => ({
              bottleneck: 'ULTRAPLAN timed out.',
              pivot_hypothesis: 'Resume from last checkpoint.',
              five_cycle_plan: [],
              checkpoint_summary: 'Timed out — using last known state.',
              cancellation_safe_summary: 'Timed out.',
              risks: ['Partial plan'],
              expected_score_delta: 0,
            }),
          });

          ultraplanSla.checkpoint(
            ultraSession.sessionId,
            cycleNumber,
            1,
            ultraResult.checkpoint_summary ?? 'ULTRAPLAN completed',
            ultraResult
          );

          const ultraApprovalId = approvalGate.request({
            runId,
            cycleNumber,
            approvalType: 'ultraplan',
            subject: ultraSession.sessionId,
            requestedBy: 'CEO',
            summary: `ULTRAPLAN pivot after ${runState.plateauCount} plateau cycles.`,
            details: ultraResult,
          });

          eventBus.broadcast({
            type: 'ultraplan_ready',
            sessionId: ultraSession.sessionId,
            approvalId: ultraApprovalId,
            result: ultraResult,
          });
        }
      }

      // ── Plateau stop ───────────────────────────────────────────────────────
      if (runState.plateauCount >= plateauCycles) {
        stoppedReason = 'plateau';
        break;
      }

      // ── CEO directive ──────────────────────────────────────────────────────

      const ceoEffectivePrompt = getEffectivePrompt('CEO', 'roles/CEO.md');
      const ceoRoleManifest = featureFlag('roleEvolution')
        ? versionManager.getActiveRole('CEO')
        : null;

      const ceoTaskId = `task_${nanoid(10)}`;
      const ceoLeaseId = featureFlag('workerLeases')
        ? leaseManager.leaseTask({
            cycleNumber,
            taskId: ceoTaskId,
            workerRole: 'CEO',
            workerInstance: `ceo_${cycleNumber}`,
            payload: { cycle: cycleNumber },
          })
        : null;

      let ceoOutput: { content: string; costUsd?: number; toolExecutionIds?: string[]; evidencePackId?: string };

      try {
        ceoOutput = await AgentRunner.runWithTools({
          runId,
          cycle: cycleNumber,
          role: 'CEO',
          task: `Produce cycle ${cycleNumber} directive. Current best score: ${runState.bestScore.toFixed(4)}. Plateau count: ${runState.plateauCount}.`,
          prompt: ceoEffectivePrompt ?? await readFile(path.join(process.cwd(), 'roles', 'CEO.md'), 'utf-8').catch(() => ''),
          model: effectiveModels.ceo ?? DEFAULT_MODELS.ceo,
          memoryContext: sharedMemoryContext,
          graphContext,
          workspaceContext: workspaceText,
          roleManifest: ceoRoleManifest,
          toolRegistry: featureFlag('toolUse') ? toolRegistry : undefined,
        });
      } catch (err) {
        if (ceoLeaseId) leaseManager.reclaimExpired();
        throw err;
      }

      if (ceoLeaseId) {
        leaseManager.complete(ceoLeaseId, { ok: true });
      }

      if (ceoOutput.costUsd) {
        runState.totalCostUsd += ceoOutput.costUsd;
      }

      transcriptWriter.event({
        type: 'agent_output',
        role: 'CEO',
        cycleNumber,
        content: redactor.redact(ceoOutput.content, { cycleNumber, channel: 'transcript' }).text,
      });

      // ── Coordinator task assignment (hierarchy mode) ───────────────────────

      let coordinatorDirective = ceoOutput.content;

      if (featureFlag('coordinatorHierarchy') && config.useHierarchy !== false) {
        const coordinatorOut = await AgentRunner.runWithTools({
          runId,
          cycle: cycleNumber,
          role: 'CoordinatorLead',
          teamId: teamIds['Planning'],
          task: ceoOutput.content,
          prompt: getEffectivePrompt('CoordinatorLead', 'roles/CoordinatorLead.md')
            ?? await readFile(path.join(process.cwd(), 'roles', 'CoordinatorLead.md'), 'utf-8').catch(() => ''),
          model: effectiveModels.coordinator ?? DEFAULT_MODELS.coordinator,
          memoryContext: await partitions.buildContext(teamIds['Planning']),
          graphContext,
          workspaceContext: workspaceText,
          toolRegistry: featureFlag('toolUse') ? toolRegistry : undefined,
        });

        if (coordinatorOut.costUsd) runState.totalCostUsd += coordinatorOut.costUsd;
        coordinatorDirective = coordinatorOut.content;

        transcriptWriter.event({
          type: 'agent_output',
          role: 'CoordinatorLead',
          cycleNumber,
          content: redactor.redact(coordinatorOut.content, { cycleNumber, channel: 'transcript' }).text,
        });

        recoveryJournal.checkpoint({
          cycleNumber,
          bestScore: runState.bestScore,
          plateauCount: runState.plateauCount,
          consecutiveRejects: runState.consecutiveRejects,
          stage: 'post_team_assignment',
          extra: { teamCount: Object.keys(teamIds).length },
        });
      }

      // ── Worker agents ──────────────────────────────────────────────────────

      const workerResults: Array<{
        role: string;
        content: string;
        costUsd?: number;
        evidencePackId?: string;
        toolExecutionIds?: string[];
      }> = [];

      const workerRoles = [
        { role: 'Engineer', teamKey: 'Research', promptFile: 'roles/Engineer.md' },
        { role: 'Critic', teamKey: 'Quality', promptFile: 'roles/Critic.md' },
        { role: 'Archivist', teamKey: 'Memory', promptFile: 'roles/Archivist.md' },
        { role: 'DevilsAdvocate', teamKey: 'Quality', promptFile: 'roles/DevilsAdvocate.md' },
      ];

      for (const worker of workerRoles) {
        const teamId = teamIds[worker.teamKey];

        const memCtx = teamId && featureFlag('teamMemoryPartitions')
          ? await partitions.buildContext(teamId)
          : sharedMemoryContext;

        const workerLeaseId = featureFlag('workerLeases')
          ? leaseManager.leaseTask({
              cycleNumber,
              taskId: `task_${nanoid(10)}`,
              workerRole: worker.role,
              workerInstance: `${worker.role.toLowerCase()}_${cycleNumber}`,
              teamId,
            })
          : null;

        let workerOut: typeof workerResults[0];

        try {
          const rawOut = await AgentRunner.runWithTools({
            runId,
            cycle: cycleNumber,
            role: worker.role,
            teamId,
            task: coordinatorDirective,
            prompt: getEffectivePrompt(worker.role, worker.promptFile)
              ?? await readFile(path.join(process.cwd(), worker.promptFile), 'utf-8').catch(() => ''),
            model: effectiveModels[worker.role.toLowerCase() as keyof typeof effectiveModels]
              ?? DEFAULT_MODELS.engineer,
            memoryContext: memCtx,
            graphContext,
            workspaceContext: workspaceText,
            roleManifest: featureFlag('roleEvolution')
              ? versionManager.getActiveRole(worker.role)
              : null,
            toolRegistry: featureFlag('toolUse') ? toolRegistry : undefined,
          });

          workerOut = {
            role: worker.role,
            content: rawOut.content,
            costUsd: rawOut.costUsd,
            evidencePackId: rawOut.evidencePackId,
            toolExecutionIds: rawOut.toolExecutionIds,
          };

          if (rawOut.costUsd) runState.totalCostUsd += rawOut.costUsd;
          if (rawOut.toolExecutionIds) runState.totalToolCalls += rawOut.toolExecutionIds.length;

          if (workerLeaseId) leaseManager.complete(workerLeaseId, { ok: true });
        } catch (err) {
          if (workerLeaseId) leaseManager.reclaimExpired();
          incidents.log({
            runId,
            severity: 'warn',
            component: 'orchestrator',
            summary: `Worker ${worker.role} failed in cycle ${cycleNumber}`,
            details: { error: err instanceof Error ? err.message : String(err) },
          });
          workerOut = { role: worker.role, content: '' };
        }

        transcriptWriter.event({
          type: 'agent_output',
          role: worker.role,
          cycleNumber,
          content: redactor.redact(workerOut.content, { cycleNumber, channel: 'transcript' }).text,
        });

        workerResults.push(workerOut);
      }

      recoveryJournal.checkpoint({
        cycleNumber,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
        consecutiveRejects: runState.consecutiveRejects,
        stage: 'post_workers',
      });

      // ── Merge evidence packs ───────────────────────────────────────────────

      let mergedPackId: string | undefined;
      const workerPackIds = workerResults
        .map(w => w.evidencePackId)
        .filter(Boolean) as string[];

      if (featureFlag('evidencePacks') && workerPackIds.length > 0) {
        const merged = await evidencePacks.merge({
          cycleNumber,
          ownerRole: 'CEO',
          packIds: workerPackIds,
          summary: `Merged worker evidence for cycle ${cycleNumber}`,
        });
        mergedPackId = merged.packId;
      }

      // ── CEO synthesis ──────────────────────────────────────────────────────

      const synthesisContext = [
        `## ORIGINAL DIRECTIVE`,
        ceoOutput.content,
        '',
        `## WORKER REPORTS`,
        ...workerResults.map(w => `### ${w.role}\n${w.content}`),
        '',
        mergedPackId ? `## EVIDENCE PACK ID\n${mergedPackId}` : '',
      ].join('\n');

      const synthesisOut = await AgentRunner.runWithTools({
        runId,
        cycle: cycleNumber,
        role: 'CEO',
        task: `Synthesize worker reports into the best possible output for cycle ${cycleNumber}.`,
        prompt: getEffectivePrompt('CEO', 'roles/CEO.md')
          ?? await readFile(path.join(process.cwd(), 'roles', 'CEO.md'), 'utf-8').catch(() => ''),
        model: effectiveModels.ceo ?? DEFAULT_MODELS.ceo,
        memoryContext: sharedMemoryContext,
        graphContext,
        workspaceContext: synthesisContext,
        evidencePackId: mergedPackId,
        toolRegistry: undefined, // synthesis does not need more tools
      });

      if (synthesisOut.costUsd) runState.totalCostUsd += synthesisOut.costUsd;

      const rawOutputText = synthesisOut.content;
      const safeOutputText = redactor.redact(rawOutputText, {
        cycleNumber,
        channel: 'output',
      }).text;

      transcriptWriter.event({
        type: 'synthesis',
        role: 'CEO',
        cycleNumber,
        content: safeOutputText,
      });

      // ── Write candidate to workspace ───────────────────────────────────────

      await writeFile(workspaceFile, safeOutputText, 'utf-8');

      // ── Verification audit (Phase 6) ───────────────────────────────────────

      let verificationReport: unknown;

      if (featureFlag('evidencePacks') && mergedPackId) {
        verificationReport = await verifier.audit({
          cycleNumber,
          role: 'CEO',
          draft: safeOutputText,
          evidencePackId: mergedPackId,
        });
        runState.lastVerificationReport = verificationReport;
      }

      // ── Provenance linking (Phase 6.1) ─────────────────────────────────────

      let provenanceReport: unknown;

      if (featureFlag('provenanceChain') && mergedPackId) {
        provenanceReport = await provenanceBuilder.linkDraft({
          cycleNumber,
          role: 'CEO',
          draft: safeOutputText,
          evidencePackId: mergedPackId,
        });
        runState.lastProvenanceReport = provenanceReport;
      }

      // ── Policy audit (Phase 6.1) ───────────────────────────────────────────

      let policyReport: unknown;

      if (featureFlag('policyEngine')) {
        policyReport = await policyAuditor.audit({
          cycleNumber,
          role: 'CEO',
          draft: safeOutputText,
          verificationReport,
          provenanceReport,
        });
      }

      recoveryJournal.checkpoint({
        cycleNumber,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
        consecutiveRejects: runState.consecutiveRejects,
        stage: 'post_score',
        extra: { mergedPackId },
      });

      // ── Ratchet scoring ────────────────────────────────────────────────────

      const score = await ratchet.score({
        proposal: {
          content: safeOutputText,
          role: 'CEO',
          cycleNumber,
        },
        graph: graphManager.getGraph(),
        verificationReport: verificationReport as any,
        evidencePackId: mergedPackId,
        toolStats: {
          toolCalls: runState.totalToolCalls,
        },
        policyReport: policyReport as any,
        provenanceReport: provenanceReport as any,
        benchmarkCase: config.benchmarkCase,
      });

      transcriptWriter.event({
        type: 'ratchet_score',
        cycleNumber,
        score,
      });

      // ── Ratchet decision ───────────────────────────────────────────────────

      const decision = ratchet.decide(score, runState.bestScore);

      recoveryJournal.checkpoint({
        cycleNumber,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
        consecutiveRejects: runState.consecutiveRejects,
        stage: 'post_decision',
        extra: { decision, score: score.composite },
      });

      // ── REVERT path ────────────────────────────────────────────────────────

      if (decision === 'REVERT') {
        await ratchet.materializeRevert(workspaceFile);
        runState.consecutiveRejects += 1;
        runState.plateauCount += 1;

        await resultsLogger.append({
          cycle: cycleNumber,
          score: score.composite,
          groundedness: score.groundedness,
          novelty: score.novelty,
          consistency: score.consistency,
          missionAlignment: score.missionAlignment,
          policyCompliance: score.policyCompliance ?? 1,
          decision: 'REVERT',
          summary: score.justification,
          costUsd: runState.totalCostUsd,
        });

        const db4 = getDb();
        db4.prepare(`
          UPDATE cycles
          SET status = 'reverted', score = ?, decision = 'REVERT', finished_at = datetime('now')
          WHERE id = ?
        `).run(score.composite, cycleId);
        db4.close();
      }

      // ── COMMIT path ────────────────────────────────────────────────────────

      if (decision === 'COMMIT') {
        const commitMessage = `cycle-${cycleNumber}: score=${score.composite.toFixed(4)} groundedness=${score.groundedness.toFixed(4)} policy=${(score.policyCompliance ?? 1).toFixed(4)}`;

        if (featureFlag('strictApprovalBlocking')) {
          // Stage pending — no git commit until approved
          const staged = await approvalEnforcer.stageCommitCandidate({
            cycleNumber,
            targetFile: workspaceFile,
            outputText: safeOutputText,
            score,
            summary: score.justification,
          });

          await resultsLogger.append({
            cycle: cycleNumber,
            score: score.composite,
            groundedness: score.groundedness,
            novelty: score.novelty,
            consistency: score.consistency,
            missionAlignment: score.missionAlignment,
            policyCompliance: score.policyCompliance ?? 1,
            decision: 'PENDING_APPROVAL',
            summary: `Staged ${staged.approvalId}: ${score.justification}`,
            costUsd: runState.totalCostUsd,
          });

          eventBus.broadcast({
            type: 'commit_pending',
            cycleNumber,
            approvalId: staged.approvalId,
            actionId: staged.actionId,
            score,
          });

          // Optimistically treat as improved for loop control
          runState.bestScore = score.composite;
          runState.consecutiveRejects = 0;
          runState.plateauCount = 0;
          runState.lastEvidencePackId = mergedPackId;

        } else {
          // Permissive mode — commit immediately
          const commitHash = await ratchet.materializeCommit({
            file: workspaceFile,
            commitMessage,
          });

          runState.bestScore = score.composite;
          runState.consecutiveRejects = 0;
          runState.plateauCount = 0;
          runState.lastEvidencePackId = mergedPackId;

          await resultsLogger.append({
            cycle: cycleNumber,
            score: score.composite,
            groundedness: score.groundedness,
            novelty: score.novelty,
            consistency: score.consistency,
            missionAlignment: score.missionAlignment,
            policyCompliance: score.policyCompliance ?? 1,
            decision: 'COMMIT',
            summary: `Committed ${commitHash}: ${score.justification}`,
            costUsd: runState.totalCostUsd,
          });
        }

        const db5 = getDb();
        db5.prepare(`
          UPDATE cycles
          SET status = 'committed', score = ?, decision = 'COMMIT', finished_at = datetime('now')
          WHERE id = ?
        `).run(score.composite, cycleId);
        db5.close();

        // ── Update graph with new output ───────────────────────────────────
        if (featureFlag('knowledgeGraph')) {
          await graphManager.ingest({
            text: safeOutputText,
            source: `cycle:${cycleNumber}`,
            weight: score.composite,
          }).catch(() => {});
        }
      }

      // ── Memory updates ─────────────────────────────────────────────────────

      if (score.composite > 0) {
        const memoryNote = redactor.redact(
          `Cycle ${cycleNumber} (score=${score.composite.toFixed(4)}): ${score.justification.slice(0, 400)}`,
          { cycleNumber, channel: 'memory' }
        ).text;

        await memory.append(memoryNote, cycleNumber).catch(() => {});
      }

      // ── DreamAgent (periodic memory consolidation) ─────────────────────────

      const dreamInterval = Number(process.env.DREAM_INTERVAL_CYCLES ?? 8);

      if (
        featureFlag('dreamAgent') &&
        cycleNumber % dreamInterval === 0
      ) {
        await dreamEngine.run().catch((err: Error) => {
          incidents.log({
            runId,
            severity: 'warn',
            component: 'dream-engine',
            summary: `DreamAgent failed: ${err.message}`,
          });
        });

        recoveryJournal.checkpoint({
          cycleNumber,
          bestScore: runState.bestScore,
          plateauCount: runState.plateauCount,
          consecutiveRejects: runState.consecutiveRejects,
          stage: 'post_dream',
        });
      }

      // ── Approve staged actions from previous cycles ────────────────────────

      if (featureFlag('strictApprovalBlocking')) {
        await approvalEnforcer.materializeApprovedActions().catch((err: Error) => {
          incidents.log({
            runId,
            severity: 'warn',
            component: 'approval-enforcer',
            summary: `Materialization failed: ${err.message}`,
          });
        });
      }

      // ── End of cycle events ────────────────────────────────────────────────

      transcriptWriter.event({
        type: 'cycle_end',
        cycleNumber,
        decision,
        score: score.composite,
        bestScore: runState.bestScore,
        plateauCount: runState.plateauCount,
      });

      eventBus.broadcast({
        type: 'cycle_complete',
        cycleNumber,
        decision,
        score,
        runState: { ...runState },
      });

    } // end cycle loop

  } catch (err) {
    stoppedReason = 'error';

    incidents.log({
      runId,
      severity: 'critical',
      component: 'orchestrator',
      summary: `Orchestrator crash at cycle ${cycleNumber}`,
      details: { error: err instanceof Error ? err.message : String(err) },
    });

    const db6 = getDb();
    db6.prepare(`
      UPDATE runs
      SET status = 'failed', finished_at = datetime('now'), error_text = ?
      WHERE id = ?
    `).run(err instanceof Error ? err.message : String(err), runId);
    db6.close();

    throw err;

  } finally {
    // ── Always release workspace lock ────────────────────────────────────────
    if (featureFlag('workspaceLocks')) {
      try { workspaceLock.release(lockKey, lockHolder); } catch {}
    }

    process.off('SIGINT', onShutdown);
    process.off('SIGTERM', onShutdown);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 17: Post-loop finalization
  // ──────────────────────────────────────────────────────────────────────────

  // Final approved-action materialization
  if (featureFlag('strictApprovalBlocking')) {
    await approvalEnforcer.materializeApprovedActions().catch(() => {});
  }

  // Final idle checkpoint
  recoveryJournal.checkpoint({
    cycleNumber,
    bestScore: runState.bestScore,
    plateauCount: runState.plateauCount,
    consecutiveRejects: runState.consecutiveRejects,
    stage: 'idle',
    extra: { stoppedReason },
  });

  // Security audit export
  const openFindings = await countOpenSecurityFindings(runId);

  if (featureFlag('securityAuditExport') && openFindings > 0) {
    await securityAudit.exportBundle('json').catch(() => {});
  }

  // Read final output
  const finalOutputText = await readFile(workspaceFile, 'utf-8').catch(() => '');

  // Finalize run record
  const db7 = getDb();
  db7.prepare(`
    UPDATE runs
    SET status = 'completed',
        finished_at = datetime('now'),
        total_cycles = ?,
        best_score = ?,
        total_cost_usd = ?,
        total_tool_calls = ?,
        stopped_reason = ?,
        final_evidence_pack_id = ?
    WHERE id = ?
  `).run(
    cycleNumber,
    runState.bestScore,
    runState.totalCostUsd,
    runState.totalToolCalls,
    stoppedReason,
    runState.lastEvidencePackId ?? null,
    runId,
  );
  db7.close();

  eventBus.broadcast({
    type: 'run_complete',
    runId,
    stoppedReason,
    bestScore: runState.bestScore,
    totalCycles: cycleNumber,
    totalCostUsd: runState.totalCostUsd,
  });

  return {
    runId,
    finalOutputText,
    finalOutputPath: workspaceFile,
    finalScore: {
      composite: runState.bestScore,
      groundedness: 0,
      novelty: 0,
      consistency: 0,
      missionAlignment: 0,
      policyCompliance: 1,
      justification: `Best score achieved over ${cycleNumber} cycles.`,
    },
    totalCostUsd: runState.totalCostUsd,
    totalToolCalls: runState.totalToolCalls,
    totalCycles: cycleNumber,
    evidencePackId: runState.lastEvidencePackId,
    verificationReport: runState.lastVerificationReport,
    provenanceReport: runState.lastProvenanceReport,
    securityFindingCount: openFindings,
    stoppedReason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK MODE ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

export async function runBenchmarkMode(input: {
  orgText: string;
  constitutionText: string;
  caseConfig: Record<string, unknown>;
  templateVariant?: string;
  constitutionVariant?: string;
  modelMap?: Record<string, string>;
  seed?: number;
}) {
  const started = Date.now();

  const result = await runAutoOrg({
    orgText: input.orgText,
    constitutionText: input.constitutionText,
    mode: 'benchmark',
    maxCycles: Number(input.caseConfig.max_cycles ?? 4),
    templateVariant: input.templateVariant,
    constitutionVariant: input.constitutionVariant,
    modelMap: input.modelMap,
    benchmarkCase: {
      caseName: String(input.caseConfig.case_name ?? 'unknown'),
      category: String(input.caseConfig.category ?? 'general'),
      difficulty: String(input.caseConfig.difficulty ?? 'medium'),
    },
  });

  return {
    runId: result.runId,
    outputText: result.finalOutputText,
    outputPath: result.finalOutputPath,
    score: result.finalScore,
    costUsd: result.totalCostUsd,
    toolCalls: result.totalToolCalls,
    latencyMs: Date.now() - started,
    evidencePackId: result.evidencePackId,
    verificationReport: result.verificationReport,
    provenanceReport: result.provenanceReport,
    securityFindingCount: result.securityFindingCount,
  };
}

// Register benchmark runner for benchmark-ci.ts to use
(globalThis as any).__AUTOORG_BENCHMARK_RUNNER__ = runBenchmarkMode;

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO CHILD MODE ENTRYPOINT
// ─────────────────────────────────────────────────────────────────────────────

export async function runPortfolioChildMode(input: {
  worktreePath: string;
  missionText: string;
  variant: {
    variantId: string;
    variantKey: string;
    constitutionVariant: string;
    templateVariant: string;
    modelMap: Record<string, string>;
  };
  budgetUsd: number;
}) {
  const started = Date.now();

  const constitutionPath = path.join(input.worktreePath, 'constitution.md');
  const constitutionText = await readFile(constitutionPath, 'utf-8').catch(
    () => await readFile(path.join(process.cwd(), 'constitution.md'), 'utf-8').catch(() => '')
  );

  const result = await runAutoOrg({
    orgText: input.missionText,
    constitutionText,
    mode: 'portfolio',
    workspaceRoot: input.worktreePath,
    constitutionVariant: input.variant.constitutionVariant,
    templateVariant: input.variant.templateVariant,
    modelMap: input.variant.modelMap,
    portfolioVariantId: input.variant.variantId,
    maxBudgetUsd: input.budgetUsd,
    maxCycles: 6,
  });

  return {
    runId: result.runId,
    outputText: result.finalOutputText,
    outputPath: result.finalOutputPath,
    score: result.finalScore,
    costUsd: result.totalCostUsd,
    latencyMs: Date.now() - started,
    toolCalls: result.totalToolCalls,
    evidencePackId: result.evidencePackId,
    verificationReport: result.verificationReport,
    provenanceReport: result.provenanceReport,
    securityFindingCount: result.securityFindingCount,
  };
}

// Register portfolio child runner
(globalThis as any).__AUTOORG_PORTFOLIO_CHILD__ = runPortfolioChildMode;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function countOpenSecurityFindings(runId: string): Promise<number> {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as n
      FROM security_findings
      WHERE run_id = ? AND status = 'open'
    `).get(runId) as { n: number };
    db.close();
    return row.n;
  } catch {
    return 0;
  }
}



The canonical orchestrator references every single one of them. Without them the agent cannot compile, let alone run. Here they are in full, in the exact order an agent should build them.


tsconfig.json
JSON

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "outDir": "./dist",
    "rootDir": "./",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": [
    "src/**/*.ts",
    "scripts/**/*.ts",
    "tests/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "web",
    "artifacts",
    "benchmarks/outputs"
  ]
}
2. bunfig.toml
toml

[install]
frozen = true
optional = false

[install.cache]
dir = "~/.bun/install/cache"
disable = false
disableManifest = false

[test]
timeout = 30000
coverage = false
coverageThreshold = 0
reporter = "default"
root = "./tests"

[run]
bun = true
3. package.json
JSON

{
  "name": "autoorg",
  "version": "0.1.0",
  "description": "Governed autonomous organization runtime",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "start": "bun run src/runtime/orchestrator-entrypoint.ts",
    "dev": "bun run --watch src/runtime/orchestrator-entrypoint.ts",
    "daemon": "bun run src/runtime/daemon.ts",
    "api": "bun run src/api/server.ts",

    "migrate": "bun run scripts/ci/migrate-all.ts",
    "migrate:verify": "bun run scripts/ci/migrate-all.ts --verify",

    "lint": "bun run scripts/ci/lint.ts",
    "typecheck": "bun run scripts/ci/typecheck.ts",
    "test": "bun test tests/ --timeout 30000",
    "test:watch": "bun test --watch tests/",
    "test:ci": "bun run scripts/ci/test-unit.ts",

    "bench": "bun run src/evals/benchmark-ci.ts",
    "bench:core": "BENCHMARK_SUITE=core bun run src/evals/benchmark-ci.ts",
    "bench:stress": "BENCHMARK_SUITE=stress bun run src/evals/benchmark-ci.ts",

    "health": "bun run scripts/ci/health-check.ts",
    "smoke": "bun run scripts/ci/smoke-test.ts",
    "security": "bun run scripts/ci/security-scan.ts",

    "setup:hooks": "git config core.hooksPath scripts/hooks && chmod +x scripts/hooks/pre-commit scripts/hooks/pre-push scripts/hooks/commit-msg",
    "ci": "bun run lint && bun run typecheck && bun run test:ci && bun run bench:core"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "nanoid": "^5.0.7",
    "openai": "^4.77.0",
    "simple-git": "^3.27.0",
    "zod": "^3.23.8",
    "chalk": "^5.3.0",
    "better-sqlite3": "^9.4.3",
    "cron-parser": "^4.9.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.4.0",
    "bun-types": "latest"
  }
}
4. .gitignore
gitignore

# Dependencies
node_modules/
.yarn/
bun.lockb.bak

# Environment
.env
.env.local
.env.production
.env.staging

# Database
*.db
*.db-shm
*.db-wal
/tmp/*.db

# Build output
dist/
.next/
out/

# AutoOrg runtime artifacts
artifacts/
!artifacts/.gitkeep