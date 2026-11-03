import { describe, expect, it } from 'bun:test';
import * as api from '../web/lib/api-client';

describe('dashboard API authentication', () => {
  it('attaches a key to same-origin API requests without overwriting caller headers', () => {
    const headers = (api as any).apiHeaders('/api/runs', { 'content-type': 'application/json' }, 'test-key');
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(headers.get('content-type')).toBe('application/json');
  });
  it('never sends the key to external or non-API paths', () => {
    for (const url of ['https://evil.test/api/runs', '//evil.test/api/runs', '/other']) {
      expect((api as any).apiHeaders(url, undefined, 'test-key').has('x-api-key')).toBe(false);
    }
  });
});

describe('dashboard framework baseline', () => {
  it('uses the upgraded Next and React majors', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync('web/package.json', 'utf8'));
    expect(Number(pkg.dependencies.next.match(/\d+/)[0])).toBeGreaterThanOrEqual(16);
    expect(Number(pkg.dependencies.react.match(/\d+/)[0])).toBeGreaterThanOrEqual(19);
    expect(Number(pkg.dependencies['react-dom'].match(/\d+/)[0])).toBeGreaterThanOrEqual(19);
  });
});
