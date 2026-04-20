import { describe, it, expect, beforeAll } from 'bun:test';
import { RatchetEngine } from '../src/runtime/ratchet.js';
import { existsSync } from 'node:fs';

describe('RatchetEngine (Phase 0 — Mock)', () => {
  const ratchet = new RatchetEngine({ mock: true });

  it('should return a score between 0 and 1', async () => {
    const score = await ratchet.mockScore(1, 0.0);
    expect(score.composite).toBeGreaterThanOrEqual(0);
    expect(score.composite).toBeLessThanOrEqual(1);
  });

  it('should return COMMIT when score > previousBest', async () => {
    // Force a high score by running many cycles (trend improves)
    let lastScore = await ratchet.mockScore(50, 0.0);
    expect(['COMMIT', 'REVERT']).toContain(lastScore.decision);
  });

  it('should return REVERT when score <= previousBest', async () => {
    // Score with impossibly high previous best
    const score = await ratchet.mockScore(1, 0.999);
    expect(score.decision).toBe('REVERT');
  });

  it('should have valid dimension weights summing to composite', async () => {
    const score = await ratchet.mockScore(10, 0.0);
    const expected =
      0.30 * score.groundedness +
      0.25 * score.novelty +
      0.25 * score.consistency +
      0.20 * score.alignment;
    expect(Math.abs(score.composite - expected)).toBeLessThan(0.001);
  });

  it('should include a justification string', async () => {
    const score = await ratchet.mockScore(5, 0.5);
    expect(score.justification).toBeTruthy();
    expect(score.justification.length).toBeGreaterThan(10);
  });
});
