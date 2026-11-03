import { describe, expect, it } from 'bun:test';
import { checkContentLength } from '../src/api/route-utils.ts';

describe('request body limit', () => {
  it('rejects declared oversized bodies, including for webhooks', () => {
    const req = new Request('http://example.test/api/webhooks/github', { method: 'POST', headers: { 'content-length': '1048577' }, body: 'x' });
    expect(checkContentLength(req)).toBe(false);
  });
  it('accepts bodies up to the limit and missing content length', () => {
    const make = (length?: string) => new Request('http://example.test', { method: 'POST', headers: length ? { 'content-length': length } : {}, body: 'x' });
    expect(checkContentLength(make('1048576'))).toBe(true);
    expect(checkContentLength(make())).toBe(true);
  });
  it('rejects malformed and negative lengths', () => {
    const make = (length: string) => new Request('http://example.test', { method: 'POST', headers: { 'content-length': length }, body: 'x' });
    expect(checkContentLength(make('-1'))).toBe(false);
    expect(checkContentLength(make('1x'))).toBe(false);
  });
});
