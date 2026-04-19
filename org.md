# org.md — AutoOrg Mission File
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
