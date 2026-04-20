#!/usr/bin/env bun
/**
 * AutoOrg Initialization Script
 * Creates the full directory structure and default files
 * Run: bun run src/scripts/init.ts
 */

import { mkdir, writeFile, exists } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const ROOT = process.cwd();

const DIRS = [
  'src',
  'src/runtime',
  'src/adapters',
  'src/db',
  'src/ui',
  'src/ui/terminal',
  'src/config',
  'src/scripts',
  'src/types',
  'src/utils',
  'roles',
  'mailbox',
  'mailbox/inbox',
  'mailbox/outbox',
  'memory',
  'memory/facts',
  'memory/transcripts',
  'workspace',
  'workspace/proposals',
  'workspace/snapshots',
  'knowledge-graph',
  'tests',
];

async function createDirs() {
  console.log(chalk.cyan('\n📁 Creating directory structure...\n'));
  for (const dir of DIRS) {
    const fullPath = path.join(ROOT, dir);
    if (!(await exists(fullPath))) {
      await mkdir(fullPath, { recursive: true });
      console.log(chalk.green(`  ✓ Created: ${dir}/`));
    } else {
      console.log(chalk.gray(`  · Exists:  ${dir}/`));
    }
  }
}

// ── Default org.md template ──────────────────────────────────────────
const ORG_MD_TEMPLATE = `# org.md — AutoOrg Mission File
# This is the ONLY file you edit. The agents handle everything else.
# Documentation: https://github.com/your-org/autoorg

---

## MISSION

You are a research organization tasked with producing a comprehensive analysis
of the following topic:

> **[REPLACE THIS WITH YOUR RESEARCH QUESTION OR GOAL]**
>
> Example: "What are the key technical challenges in building safe autonomous AI systems?"
> Example: "Analyze the competitive landscape for electric vehicle batteries in 2025."
> Example: "Produce a 10-page policy brief on urban housing affordability."

The objective is to produce a well-structured, deeply-researched output document.

**Success metric:** The final output should score above 0.75 on the ratchet rubric.

---

## TEAM CONFIGURATION

Uncomment roles you want active (all active by default):

- CEO            # Orchestrates all agents, assigns tasks, synthesizes output
- Engineer       # Produces concrete drafts, code, or structured content
- Critic         # Reviews all output. Never rubber-stamps. Always finds flaws.
- Archivist      # Maintains memory. Prevents the team from repeating failures.
- DevilsAdvocate # Argues the least popular position every single cycle.
- RatchetJudge   # Scores output against constitution.md. Keep or revert.
- DreamAgent     # Runs every 10 cycles. Consolidates memory. Removes contradictions.

---

## MODEL ASSIGNMENTS
# Format: ROLE: provider/model
# Providers: anthropic | openai | ollama | groq | together | gemini
# Leave blank to use DEFAULT_LLM_PROVIDER from .env

CEO:            anthropic/claude-sonnet-4-5
Engineer:       ollama/qwen2.5:14b
Critic:         anthropic/claude-sonnet-4-5
DevilsAdvocate: ollama/qwen2.5:32b
Archivist:      ollama/qwen2.5:14b
RatchetJudge:   anthropic/claude-opus-4
DreamAgent:     anthropic/claude-sonnet-4-5

---

## DOMAIN SEED MATERIAL
# Paste your source material here. This becomes the knowledge graph.
# Can be: news articles, research papers, reports, problem statements, codebases.
# The agents will ONLY make claims grounded in this material.

[PASTE YOUR SOURCE MATERIAL HERE]

---

## CONSTRAINTS
# The agents will NEVER violate these. Listed in priority order.
# These are checked by the Ratchet Judge against every proposal.

1. All claims must be traceable to the seed material above.
2. The output must not exceed 5,000 words.
3. Do not speculate beyond what the evidence supports.
4. [ADD YOUR DOMAIN-SPECIFIC CONSTRAINTS HERE]

---

## STOPPING CRITERIA
# The loop stops when ANY of these conditions are met.

MAX_CYCLES: 50
PLATEAU_CYCLES: 10          # Stop if score doesn't improve for N cycles
CONSECUTIVE_REJECTS: 5      # Stop if Ratchet Judge rejects N proposals in a row
MAX_API_SPEND_USD: 10.00    # Hard budget cap
TARGET_SCORE: 0.85          # Stop early if we hit this score

---

## CYCLE SETTINGS

CYCLE_DREAM_INTERVAL: 10    # Run autoDream memory consolidation every N cycles
MAX_WORKERS_PARALLEL: 4     # How many agents run in parallel (set lower if on Ollama)
CYCLE_TIMEOUT_MS: 480000    # Max 8 minutes per cycle before timeout
`;

// ── constitution.md — IMMUTABLE ──────────────────────────────────────
const CONSTITUTION_MD = `# constitution.md — AutoOrg Evaluation Constitution
#
# !! THIS FILE IS READ-ONLY !!
# !! AGENTS THAT MODIFY THIS FILE ARE IMMEDIATELY TERMINATED !!
# !! HUMANS SHOULD NOT EDIT THIS AFTER THE FIRST RUN !!
#
# This file is the immutable evaluation harness.
# It defines HOW proposals are scored, not what they should contain.
# Changing it mid-run would be like changing the exam paper after students
# have already started writing — it invalidates all previous scores.

---

## SCORING DIMENSIONS

### 1. GROUNDEDNESS (weight: 0.30)
Every factual claim in the output must be traceable to an entity or relationship
in the knowledge graph (built from org.md seed material).

Scoring formula:
  score = grounded_claims / total_claims
  
Penalty: -0.10 for each claim that directly contradicts the knowledge graph.
Floor: 0.0 (cannot be negative)

### 2. NOVELTY (weight: 0.25)
The proposal must not repeat content from previous failed experiments.
It should introduce new framings, arguments, or evidence each cycle.

Scoring formula:
  score = 1.0 - semantic_overlap_with_previous_outputs
  
Where semantic_overlap is measured against failed_experiments.md memory file.
A score of 1.0 = completely novel. A score of 0.0 = exact repetition.

### 3. INTERNAL CONSISTENCY (weight: 0.25)
The output must not contain internal contradictions.
Unresolved Critic objections directly reduce this score.

Scoring formula:
  score = 1.0 - (unresolved_blockers * 0.20) - (unresolved_majors * 0.05)
  
BLOCKER objection: -0.20 each
MAJOR objection: -0.05 each  
MINOR objection: 0.00 penalty (noted but not penalized)
Floor: 0.0

### 4. MISSION ALIGNMENT (weight: 0.20)
How directly does the output serve the MISSION defined in org.md?
Evaluated by the Ratchet Judge as an LLM-as-judge scoring.

Scale: 0.0 = completely off-topic, 1.0 = perfectly aligned

---

## COMPOSITE SCORE FORMULA

  composite = (0.30 × groundedness) + (0.25 × novelty) + (0.25 × consistency) + (0.20 × alignment)

---

## RATCHET RULE

  IF composite_score > previous_best_score:
    → git commit (proposal becomes new baseline)
    → append COMMIT to results.tsv
    
  IF composite_score ≤ previous_best_score:
    → git reset --hard HEAD (proposal discarded)
    → append REVERT to results.tsv

---

## AUTOMATIC DISQUALIFICATIONS (score = 0.0)

The following conditions result in an automatic score of 0.0, regardless
of other dimension scores:

1. BLOCKER objection from Critic present AND unresolved in proposal
2. Proposal modifies memory/facts/validated_decisions.md without Archivist approval
3. Any agent claims to have modified constitution.md
4. Output contains fewer than 100 words (empty/trivial proposals)
5. Proposal is semantically identical (>0.95 overlap) to a previous proposal

---

## JUDGE INSTRUCTIONS

The Ratchet Judge MUST:
1. Read this constitution carefully before scoring
2. Score each dimension independently with explicit reasoning
3. List every Critic objection and whether it was resolved
4. Never score above 0.5 on consistency if a BLOCKER objection exists
5. Return a structured JSON object (see schema in src/types/ratchet.ts)
6. Use Opus model ONLY — never downgrade to Sonnet or Haiku for judging
`;

// ── memory/MEMORY.md — Tier 1 Memory Index ───────────────────────────
const MEMORY_INDEX = `# MEMORY.md — AutoOrg Memory Index (Tier 1)
# 
# ALWAYS LOADED into every agent's context.
# Keep this file UNDER 150 lines. The Archivist enforces this.
# This file contains POINTERS ONLY — never full content.
# Full content lives in memory/facts/ (Tier 2)
#
# Last updated: [INIT]
# Managed by: Archivist Agent

---

## STATUS
Cycles completed: 0
Best score: 0.000
Last dream consolidation: Never
Total validated decisions: 0
Total failed experiments: 0

---

## KNOWLEDGE GRAPH
Location: ./knowledge-graph/graph.db
Entities: 0
Relationships: 0
Status: NOT BUILT (runs on first cycle)

---

## VALIDATED DECISIONS
File: ./memory/facts/validated_decisions.md
Count: 0
Summary: No validated decisions yet.

---

## FAILED EXPERIMENTS  
File: ./memory/facts/failed_experiments.md
Count: 0
Patterns: None identified yet.

---

## ACTIVE CONSTRAINTS
[Loaded from org.md on each run]

---

## STANDING OBJECTIONS FROM CRITIC
None yet.

---

## TRANSCRIPT ARCHIVE
Location: ./memory/transcripts/
Count: 0 files
Search: grep -r "keyword" ./memory/transcripts/
DO NOT load full transcripts — search only.
`;

const VALIDATED_DECISIONS = `# validated_decisions.md — AutoOrg Fact Memory (Tier 2)
# Written by: Archivist Agent
# Read by: All agents (on-demand, not always-loaded)
# 
# Format: Each entry has a cycle number, score delta, and the decision.

[No validated decisions yet — this file is populated as AutoOrg runs]
`;

const FAILED_EXPERIMENTS = `# failed_experiments.md — AutoOrg Failure Memory (Tier 2)
# Written by: Archivist Agent  
# Read by: All agents (on-demand, not always-loaded)
#
# This file prevents the team from trying the same failed approaches.
# Format: cycle | score | why_it_failed | what_to_avoid

[No failed experiments yet — this file is populated as AutoOrg runs]
`;

const DOMAIN_KNOWLEDGE = `# domain_knowledge.md — AutoOrg Domain Facts (Tier 2)
# Written by: Archivist Agent + autoDream consolidation
# Read by: All agents (on-demand)
#
# Contains absolute facts extracted from seed material.
# Updated by autoDream every N cycles.
# Format: FACT: [statement] | SOURCE: [entity in knowledge graph] | CONFIDENCE: [0.0-1.0]

[Populated after first knowledge graph build]
`;

// ── current_output.md — the living workspace document ────────────────
const CURRENT_OUTPUT = `# AutoOrg Output Document
# This file is the living product of the AutoOrg organization.
# It is modified by agents each cycle and committed to git when score improves.
# Version: 0 (initial — before any agent has contributed)

---

[AutoOrg has not yet begun. Run \`bun start\` to begin the research loop.]
`;

async function createDefaultFiles() {
  console.log(chalk.cyan('\n📄 Creating default files...\n'));

  const files: [string, string, boolean][] = [
    // [path, content, overwrite-if-exists]
    ['org.md', ORG_MD_TEMPLATE, false],
    ['constitution.md', CONSTITUTION_MD, false],
    ['memory/MEMORY.md', MEMORY_INDEX, false],
    ['memory/facts/validated_decisions.md', VALIDATED_DECISIONS, false],
    ['memory/facts/failed_experiments.md', FAILED_EXPERIMENTS, false],
    ['memory/facts/domain_knowledge.md', DOMAIN_KNOWLEDGE, false],
    ['workspace/current_output.md', CURRENT_OUTPUT, false],
    ['results.tsv', 'cycle\ttimestamp\tscore\tgroundedness\tnovelty\tconsistency\talignment\tdecision\tsummary\n', false],
  ];

  for (const [filePath, content, overwrite] of files) {
    const fullPath = path.join(ROOT, filePath);
    if (!(await exists(fullPath)) || overwrite) {
      await writeFile(fullPath, content, 'utf-8');
      console.log(chalk.green(`  ✓ Created: ${filePath}`));
    } else {
      console.log(chalk.gray(`  · Exists:  ${filePath} (skipped)`));
    }
  }
}

async function setupGit() {
  console.log(chalk.cyan('\n🔧 Setting up git...\n'));
  const { $ } = await import('bun');
  
  try {
    // Check if already a git repo
    await $`git rev-parse --git-dir`.quiet();
    console.log(chalk.gray('  · Git repo already initialized'));
  } catch {
    await $`git init`.quiet();
    console.log(chalk.green('  ✓ Git initialized'));
  }

  // Create .gitignore
  const gitignore = `node_modules/
.env
autoorg.db
autoorg.db-shm
autoorg.db-wal
*.map
.DS_Store
mailbox/inbox/*.json
mailbox/outbox/*.json
`;
  await writeFile(path.join(ROOT, '.gitignore'), gitignore);
  console.log(chalk.green('  ✓ .gitignore created'));

  // Initial commit
  try {
    await $`git add org.md constitution.md memory/ workspace/ results.tsv`.quiet();
    await $`git commit -m "AutoOrg: initial project scaffold" --allow-empty`.quiet();
    console.log(chalk.green('  ✓ Initial git commit created'));
  } catch {
    console.log(chalk.gray('  · Git commit skipped (already committed)'));
  }
}

async function main() {
  console.log(chalk.bold.cyan('╔════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  AutoOrg — Project Initialization  ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════╝'));

  await createDirs();
  await createDefaultFiles();
  await setupGit();

  console.log(chalk.bold.green('\n✅ AutoOrg initialized successfully!\n'));
  console.log(chalk.white('Next steps:'));
  console.log(chalk.yellow('  1. cp .env.example .env'));
  console.log(chalk.yellow('  2. Edit .env with your API keys (or set OLLAMA_BASE_URL for local)'));
  console.log(chalk.yellow('  3. Edit org.md — write your MISSION and paste your seed material'));
  console.log(chalk.yellow('  4. bun run db:migrate  — set up the database'));
  console.log(chalk.yellow('  5. bun start           — begin the research loop\n'));
}

main().catch(console.error);
