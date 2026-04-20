// src/config/model-costs.ts
// Cost per million tokens (USD) for each supported model.
// Update these as provider pricing changes.

import type { ModelCost } from '@/types/index.js';

export const MODEL_COSTS: Record<string, ModelCost> = {
  // Anthropic
  'claude-opus-4':           { inputPerMToken: 15.00,  outputPerMToken: 75.00  },
  'claude-sonnet-4-5':       { inputPerMToken: 3.00,   outputPerMToken: 15.00  },
  'claude-haiku-3-5':        { inputPerMToken: 0.80,   outputPerMToken: 4.00   },

  // OpenAI
  'gpt-4.1':                 { inputPerMToken: 2.00,   outputPerMToken: 8.00   },
  'gpt-4o':                  { inputPerMToken: 5.00,   outputPerMToken: 15.00  },
  'gpt-4o-mini':             { inputPerMToken: 0.15,   outputPerMToken: 0.60   },
  'o1':                      { inputPerMToken: 15.00,  outputPerMToken: 60.00  },
  'o3-mini':                 { inputPerMToken: 1.10,   outputPerMToken: 4.40   },

  // Fallback for unknown models
  'default':                 { inputPerMToken: 3.00,   outputPerMToken: 15.00  },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? MODEL_COSTS['default']!;
  return (
    (inputTokens / 1_000_000) * costs.inputPerMToken +
    (outputTokens / 1_000_000) * costs.outputPerMToken
  );
}
