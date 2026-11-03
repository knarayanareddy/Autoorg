import { describe, expect, it } from 'bun:test';
import { LLMBudget, runBudgetedLLM, withLLMBudget } from '../src/runtime/llm-budget';
import { withLLMRetry } from '../src/utils/retry';
import { guardAdapter } from '../src/adapters/adapter-factory';
import type { LLMAdapter } from '../src/types/index';
import { z } from 'zod';

describe('LLM budget guard', () => {
  it('serializes parallel calls and checks remaining budget before each', async () => {
    const guard = new LLMBudget(1);
    let calls = 0;
    const run = () => runBudgetedLLM(async () => { calls++; await Bun.sleep(10); return { costUsd: 1 }; });
    const outcomes = await withLLMBudget(guard, () => Promise.allSettled([run(), run()]));
    expect(calls).toBe(1);
    expect(outcomes.map((v: any) => v.status)).toEqual(['fulfilled', 'rejected']);
    expect(guard.spent).toBe(1);
  });
  it('rechecks after an explicitly priced failure before retry', async () => {
    const guard = new LLMBudget(1);
    let calls = 0;
    await expect(withLLMBudget(guard, () => withLLMRetry('test', () => runBudgetedLLM(async () => {
      calls++; throw Object.assign(new Error('failure'), { costUsd: 1 });
    }), { maxRetries: 3, baseDelayMs: 0, jitter: false }))).rejects.toThrow(/budget/i);
    expect(calls).toBe(1);
    expect(guard.spent).toBe(1);
  });
  it('fails closed on unknown billed cost or invalid reported cost', async () => {
    const guard = new LLMBudget(1);
    let calls = 0;
    await expect(withLLMBudget(guard, () => withLLMRetry('test', () => runBudgetedLLM(async () => {
      calls++; throw new Error('timeout, billing unknown');
    }), { maxRetries: 3, baseDelayMs: 0 }))).rejects.toThrow(/unknown/i);
    expect(calls).toBe(1);
    await expect(withLLMBudget(guard, () => runBudgetedLLM(async () => ({ costUsd: 0 })))).rejects.toThrow(/unknown/i);
    const other = new LLMBudget(1);
    await expect(withLLMBudget(other, () => runBudgetedLLM(async () => ({ costUsd: NaN })))).rejects.toThrow(/unknown/i);
  });
  it('enforces the guard through the adapter used by graph, agents and dreams', async () => {
    let calls = 0;
    const adapter = guardAdapter({
      provider: 'anthropic',
      run: async () => { calls++; return { content: 'ok', costUsd: 1 }; },
      structured: async () => { throw new Error('should not run'); },
    } as LLMAdapter);
    const guard = new LLMBudget(1);
    const opts = { model: 'test', messages: [] };
    await withLLMBudget(guard, () => adapter.run(opts));
    await expect(withLLMBudget(guard, () => adapter.run(opts))).rejects.toThrow(/budget/i);
    expect(calls).toBe(1);
  });

  it('budgets structured-output calls and retries after malformed responses', async () => {
    let calls = 0;
    const adapter = guardAdapter({
      provider: 'anthropic',
      run: async () => { calls++; return { content: calls === 1 ? 'bad json' : '{"ok":true}', costUsd: 0.6 }; },
      structured: async () => { throw new Error('must use budgeted run'); },
    } as LLMAdapter);
    const budget = new LLMBudget(1);
    const result = await withLLMBudget(budget, () => adapter.structured({ model: 'test', messages: [], schema: z.object({ ok: z.boolean() }), maxRetries: 2 }));
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
    expect(budget.spent).toBeCloseTo(1.2);
    await expect(withLLMBudget(budget, () => adapter.structured({ model: 'test', messages: [], schema: z.object({ ok: z.boolean() }) }))).rejects.toThrow(/budget/i);
    expect(calls).toBe(2);
  });

});
