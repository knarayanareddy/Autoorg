import { describe, expect, it } from 'bun:test';
import { serverError, HttpError, parseJsonBody } from '../src/api/route-utils.ts';

describe('API error handling', () => {
  it('does not expose internal error details', async () => {
    const response = serverError();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
  it('classifies malformed JSON as a safe 400', async () => {
    const request = new Request('http://example.test', { method: 'POST', body: '{"secret":invalid' });
    try {
      await parseJsonBody(request);
      throw new Error('should have rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as any).status).toBe(400);
      expect((error as Error).message).toBe('Invalid JSON');
    }
  });
  it('preserves valid JSON', async () => {
    const request = new Request('http://example.test', { method: 'POST', body: '{"ok":true}' });
    expect(await parseJsonBody(request)).toEqual({ ok: true });
  });
});
