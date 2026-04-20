/**
 * AutoOrg — Exponential Backoff Retry Utility
 */
import chalk from 'chalk';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export class RetryError extends Error {
  constructor(public readonly attempts: number, public readonly lastError: Error) {
    super(`Failed after ${attempts} attempts. Last error: ${lastError.message}`);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries   = opts.maxRetries  ?? parseInt(process.env.AUTOORG_MAX_RETRIES ?? '3');
  const baseDelayMs  = opts.baseDelayMs ?? parseInt(process.env.AUTOORG_RETRY_DELAY_MS ?? '2000');
  const maxDelayMs   = opts.maxDelayMs  ?? 30_000;
  const useJitter    = opts.jitter      ?? true;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt > maxRetries) break;
      const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter      = useJitter ? Math.random() * 1000 : 0;
      const delayMs     = exponential + jitter;
      if (opts.onRetry) {
        opts.onRetry(attempt, lastError, delayMs);
      } else {
        console.warn(chalk.yellow(`  ⚠  Retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s: ${lastError.message.slice(0, 80)}`));
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new RetryError(maxRetries, lastError);
}

export async function withLLMRetry<T>(role: string, fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  return withRetry(fn, {
    ...opts,
    onRetry: (attempt, error, delayMs) => {
      console.warn(chalk.yellow(`  ⚠  [${role}] LLM call failed (attempt ${attempt}). Retrying in ${(delayMs / 1000).toFixed(1)}s: ${error.message.slice(0, 60)}`));
    },
  });
}