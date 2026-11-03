import { describe, expect, it } from 'bun:test';
import { estimateReportedCost } from '../src/config/model-costs';
describe('provider usage cost', () => {
  it('does not treat missing or malformed usage as free', () => {
    const estimate = estimateReportedCost;
    expect(estimate('gpt-4o', undefined, 2)).toBeUndefined();
    expect(estimate('gpt-4o', 1, undefined)).toBeUndefined();
    expect(estimate('gpt-4o', NaN, 2)).toBeUndefined();
    expect(estimate('gpt-4o', -1, 2)).toBeUndefined();
    expect(estimate('gpt-4o', 1, 2)).toBeGreaterThan(0);
  });
});
