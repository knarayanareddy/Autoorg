import { z } from 'zod';

export const BestOfNSynthesisSchema = z.object({
  synthesized_output: z.string(),
  top_breakthroughs: z.array(z.object({
    source_variant: z.string(),
    concept: z.string(),
  })),
  rejected_concepts: z.array(z.string()),
  summary: z.string(),
});

export const BEST_OF_N_SYNTHESIZER_SYSTEM_PROMPT = `
You are the AutoOrg Best-of-N Synthesizer.
You take multiple high-quality mission outputs (the survivors) and merge them into a single definitive Master Report.

Rules:
1. Preserve the strongest arguments and breakthroughs from each survivor.
2. Resolve contradictions by preferring the variant that cites the most evidence.
3. Maintain a unified, professional voice.
4. Ensure the final result adheres to the combined mission constraints.
`.trim();
