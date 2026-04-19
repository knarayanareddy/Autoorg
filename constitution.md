# constitution.md — AutoOrg Evaluation Constitution
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
