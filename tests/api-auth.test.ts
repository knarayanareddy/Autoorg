/**
 * API auth + webhook signature tests.
 *
 * Regression coverage for two holes:
 *   1. Approval/interview/hosted-run endpoints were unauthenticated behind
 *      wildcard CORS, so any origin could approve a staged commit.
 *   2. `timingSafeEqual` threw on a malformed signature, turning an
 *      unauthenticated webhook route into a 500.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
  authenticate, safeEqual, corsHeaders, checkBootSafety, getAuthConfig,
} from '../src/api/auth.ts';
import { verifySignature } from '../src/api/webhooks/github.ts';
import { verifyGitHubSignature } from '../src/integrations/webhooks.ts';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTOORG_') || key === 'GITHUB_WEBHOOK_SECRET') {
      delete process.env[key];
    }
  }
}

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3001/api/approvals/x/approve', { method, headers });
}

beforeEach(resetEnv);
afterEach(() => {
  resetEnv();
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('authenticate', () => {
  it('fails closed when no key is configured', () => {
    expect(getAuthConfig().apiKey).toBeNull();
    expect(authenticate(req('POST'), true).ok).toBe(false);
  });

  it('rejects a mutating request with no key once a key is configured', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    const result = authenticate(req('POST'), true);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('accepts the key as a Bearer token', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    const result = authenticate(req('POST', { authorization: 'Bearer sk-test-secret' }), true);
    expect(result.ok).toBe(true);
  });

  it('accepts the key as x-api-key', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    const result = authenticate(req('POST', { 'x-api-key': 'sk-test-secret' }), true);
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong key', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    const result = authenticate(req('POST', { authorization: 'Bearer sk-wrong' }), true);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('protects read-only requests when a key is configured', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    expect(authenticate(req('GET'), false).status).toBe(401);
    expect(authenticate(req('GET', { 'x-api-key': 'sk-test-secret' }), false).ok).toBe(true);
  });
});

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('rejects different strings of the same length', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(() => safeEqual('abc', 'abcdef')).not.toThrow();
    expect(safeEqual('abc', 'abcdef')).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('does not emit a wildcard origin', () => {
    const headers = corsHeaders(req('GET', { origin: 'https://evil.example' }));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('echoes an allowlisted origin', () => {
    process.env.AUTOORG_CORS_ORIGINS = 'https://app.example.com';
    const headers = corsHeaders(req('GET', { origin: 'https://app.example.com' }));
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('allows the auth headers through preflight', () => {
    const headers = corsHeaders(req('OPTIONS'));
    expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
    expect(headers['Access-Control-Allow-Headers']).toContain('x-api-key');
  });
});

describe('checkBootSafety', () => {
  it('refuses a public bind without an API key', () => {
    expect(checkBootSafety('0.0.0.0')).toContain('AUTOORG_API_KEY');
  });

  it('refuses a loopback bind without an API key', () => {
    expect(checkBootSafety('127.0.0.1')).toContain('AUTOORG_API_KEY');
    expect(checkBootSafety('localhost')).toContain('AUTOORG_API_KEY');
  });

  it('allows a public bind when a key is set', () => {
    process.env.AUTOORG_API_KEY = 'sk-test-secret';
    expect(checkBootSafety('0.0.0.0')).toBeNull();
  });
});

describe('GitHub webhook signatures', () => {
  const secret = 'webhook-secret';
  const body = JSON.stringify({ action: 'opened', number: 7 });
  const goodSig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature', () => {
    expect(verifySignature(body, goodSig, secret)).toBe(true);
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    expect(verifyGitHubSignature(body, goodSig)).toBe(true);
  });

  it('rejects a mismatched signature', () => {
    const bad = 'sha256=' + 'a'.repeat(64);
    expect(verifySignature(body, bad, secret)).toBe(false);
  });

  // The regression: this used to throw RangeError.
  it('rejects a malformed signature without throwing (both implementations)', () => {
    expect(() => verifySignature(body, 'sha256=abc', secret)).not.toThrow();
    expect(verifySignature(body, 'sha256=abc', secret)).toBe(false);

    process.env.GITHUB_WEBHOOK_SECRET = secret;
    expect(() => verifyGitHubSignature(body, 'sha256=abc')).not.toThrow();
    expect(verifyGitHubSignature(body, 'sha256=abc')).toBe(false);
  });

  it('rejects an empty signature', () => {
    expect(verifySignature(body, '', secret)).toBe(false);
    expect(verifyGitHubSignature(body, null)).toBe(false);
  });

  it('rejects when no secret is configured (fail closed)', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expect(verifyGitHubSignature(body, goodSig)).toBe(false);
  });

  it('rejects a signature for a different body', () => {
    expect(verifySignature('tampered', goodSig, secret)).toBe(false);
  });
});
