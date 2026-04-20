TypeScript

import { z } from 'zod';

export const TournamentRefereeSchema = z.object({
  winner_variant_id: z.string(),
  rationale: z.string(),
  edge_cases: z.array(z.string()).max(6),
});

export const TOURNAMENT_REFEREE_SYSTEM_PROMPT = `
You referee a head-to-head tournament match between two AutoOrg variants.

Pick the winner based on:
- mission fitness
- groundedness
- policy compliance
- strategic usefulness
- output quality under constraints

Hard rules:
- This is comparative, not absolute.
- Choose the variant you would fund for the next round.
- If one variant is riskier or less governed, that matters.
`.trim();
16. Tournament runtime