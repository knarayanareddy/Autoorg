import { AsyncLocalStorage } from 'node:async_hooks';

export class LLMBudgetError extends Error {}
export class BudgetExceededError extends LLMBudgetError {
  constructor() { super('LLM budget exhausted'); }
}
export class BudgetUnknownError extends LLMBudgetError {
  constructor() { super('LLM cost is unknown; stopping further calls'); }
}

/** Serializes calls in a run so concurrent agents cannot all spend the same remainder. */
export class LLMBudget {
  private tail: Promise<void> = Promise.resolve();
  private uncertain = false;
  private total = 0;
  constructor(readonly limit: number, private readonly onCharge?: (spent: number) => void) {
    if (!Number.isFinite(limit) || limit <= 0) throw new Error('LLM budget must be a positive finite number');
  }
  get spent(): number { return this.total; }
  get exhausted(): boolean { return this.uncertain || this.total >= this.limit; }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (this.uncertain) throw new BudgetUnknownError();
      if (this.total >= this.limit) throw new BudgetExceededError();
      let response: T;
      try { response = await fn(); }
      catch (err) {
        // Unless a provider explicitly reports the charge, timeouts and other
        // failed requests may still have been billed. Do not retry blindly.
        const charge = (err as { costUsd?: unknown } | null)?.costUsd;
        if (typeof charge !== 'number' || !Number.isFinite(charge) || charge < 0) {
          this.uncertain = true;
          throw new BudgetUnknownError();
        }
        this.charge(charge);
        throw err;
      }
      const cost = (response as { costUsd?: unknown } | null)?.costUsd;
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        this.uncertain = true;
        throw new BudgetUnknownError();
      }
      this.charge(cost);
      return response;
    } finally { release(); }
  }

  private charge(amount: number): void {
    this.total += amount;
    try { this.onCharge?.(this.total); }
    catch { this.uncertain = true; throw new BudgetUnknownError(); }
  }
}

const currentBudget = new AsyncLocalStorage<LLMBudget>();
export function withLLMBudget<T>(budget: LLMBudget, fn: () => T): T { return currentBudget.run(budget, fn); }
export function runBudgetedLLM<T>(fn: () => Promise<T>): Promise<T> {
  const budget = currentBudget.getStore();
  return budget ? budget.run(fn) : fn();
}
export function hasLLMBudget(): boolean { return currentBudget.getStore() !== undefined; }
