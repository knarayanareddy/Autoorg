import { describe, expect, it } from 'bun:test';
import { AuthRateLimiter } from '../src/api/rate-limit.ts';

describe('authentication rate limit', () => {
  it('locks an address after ten failures and grows repeated lockouts', () => {
    const limiter = new AuthRateLimiter();
    for (let i = 0; i < 10; i++) limiter.recordFailure('one', 0);
    expect(limiter.retryAfter('one', 1)).toBe(30);
    expect(limiter.retryAfter('other', 1)).toBe(0);
    expect(limiter.retryAfter('one', 30001)).toBe(0);
    for (let i = 0; i < 10; i++) limiter.recordFailure('one', 30001);
    expect(limiter.retryAfter('one', 30002)).toBe(60);
  });
  it('clears history on successful authentication', () => {
    const limiter = new AuthRateLimiter();
    for (let i = 0; i < 9; i++) limiter.recordFailure('one', 0);
    limiter.recordSuccess('one');
    limiter.recordFailure('one', 1);
    expect(limiter.retryAfter('one', 1)).toBe(0);
  });
  it('expires failures outside the rolling time window', () => {
    const limiter = new AuthRateLimiter();
    for (let i = 0; i < 9; i++) limiter.recordFailure('one', 0);
    limiter.recordFailure('one', 60001);
    expect(limiter.retryAfter('one', 60001)).toBe(0);
  });
});
