TypeScript

/**
 * AutoOrg — Token Counter
 * 
 * Rough token estimation without loading tiktoken (saves 5MB+).
 * Accurate enough for budget tracking.
 * Rule of thumb: ~4 chars per token for English text.
 */

export function estimateTokens(text: string): number {
  // More accurate than simple /4 division:
  // Accounts for code (higher density) and whitespace
  const words     = text.split(/\s+/).length;
  const chars     = text.length;
  const codeBlocks = (text.match(/```[\s\S]*?```/g) ?? []).length;

  // Base: ~1.3 tokens per word for English prose
  // Code blocks: ~2 tokens per word (symbols, indentation)
  const baseTokens = words * 1.3;
  const codeBonus  = codeBlocks * 50; // rough estimate per code block

  // Cross-check with character count
  const charEstimate = chars / 4;

  // Average the two estimates
  return Math.ceil((baseTokens + charEstimate + codeBonus) / 2);
}

export function formatTokenCost(tokens: number, costUsd: number): string {
  if (costUsd === 0) return `${tokens.toLocaleString()} tokens (free/local)`;
  return `${tokens.toLocaleString()} tokens ($${costUsd.toFixed(5)})`;
}