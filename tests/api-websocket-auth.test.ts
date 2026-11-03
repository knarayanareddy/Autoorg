import { afterEach, describe, expect, it } from 'bun:test';
import { authorizeWsUpgrade } from '../src/api/auth.ts';
const previousKey = process.env.AUTOORG_API_KEY;
const previousOrigins = process.env.AUTOORG_CORS_ORIGINS;
afterEach(() => {
  if (previousKey === undefined) delete process.env.AUTOORG_API_KEY; else process.env.AUTOORG_API_KEY = previousKey;
  if (previousOrigins === undefined) delete process.env.AUTOORG_CORS_ORIGINS; else process.env.AUTOORG_CORS_ORIGINS = previousOrigins;
});
const req = (path = '/ws', headers: Record<string, string> = {}) => new Request(`http://localhost:3001${path}`, { headers });
describe('WebSocket authorization', () => {
  it('requires a valid key whenever configured, even for loopback proxies', () => {
    process.env.AUTOORG_API_KEY = 'test-key';
    const check = authorizeWsUpgrade;
    expect(check(req(), '127.0.0.1').ok).toBe(false);
    expect(check(req('/ws', { 'x-api-key': 'test-key' }), '198.51.100.1').ok).toBe(true);
    expect(check(req('/ws?token=test-key'), null).ok).toBe(true);
    expect(check(req('/ws?token=wrong'), '127.0.0.1').ok).toBe(false);
  });
  it('only allows unkeyed loopback clients and trusted origins', () => {
    delete process.env.AUTOORG_API_KEY;
    delete process.env.AUTOORG_CORS_ORIGINS;
    const check = authorizeWsUpgrade;
    expect(check(req(), '127.0.0.1').ok).toBe(true);
    expect(check(req(), '::ffff:127.0.0.1').ok).toBe(true);
    expect(check(req(), null).ok).toBe(false);
    expect(check(req(), '203.0.113.2').ok).toBe(false);
    expect(check(req('/ws', { origin: 'https://attacker.example' }), '127.0.0.1').ok).toBe(false);
    expect(check(req('/ws', { origin: 'http://localhost:3000' }), '127.0.0.1').ok).toBe(true);
  });
});
