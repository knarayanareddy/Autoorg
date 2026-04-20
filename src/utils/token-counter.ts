/**
 * AutoOrg — Token Counter
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words     = text.split(/\s+/).length;
  const chars     = text.length;
  const codeBlocks = (text.match(/```[\s\S]*?```/g) ?? []).length;

  const baseTokens = words * 1.3;
  const codeBonus  = codeBlocks * 50;
  const charEstimate = chars / 4;

  return Math.ceil((baseTokens + charEstimate + codeBonus) / 2);
}

export function formatTokenCost(tokens: number, costUsd: number): string {
  if (costUsd === 0) return `${tokens.toLocaleString()} tokens (free/local)`;
  return `${tokens.toLocaleString()} tokens ($${costUsd.toFixed(5)})`;
}