import { describe, it, expect, afterEach } from 'bun:test';
import { createHmac } from 'node:crypto';
import { handlePlatformRoutes } from '../src/api/platform-routes.ts';

const saved = { flag: process.env.FEATURE_GITHUB_INTEGRATION, secret: process.env.GITHUB_WEBHOOK_SECRET };
afterEach(() => {
  if (saved.flag === undefined) delete process.env.FEATURE_GITHUB_INTEGRATION; else process.env.FEATURE_GITHUB_INTEGRATION = saved.flag;
  if (saved.secret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET; else process.env.GITHUB_WEBHOOK_SECRET = saved.secret;
});
const url = new URL('http://localhost/api/webhooks/github');
const body = JSON.stringify({ action: 'closed' });
const secret = 'synthetic-webhook-secret';
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
const post = (signatureValue = signature) => new Request(url, { method: 'POST', headers: { 'x-hub-signature-256': signatureValue }, body });

describe('webhook routing', () => {
  it('rejects even correctly signed deliveries when integration is disabled', async () => {
    process.env.FEATURE_GITHUB_INTEGRATION = '0';
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    expect((await handlePlatformRoutes(url, post()))?.status).toBe(403);
  });
  it('accepts valid signatures only when enabled, and only on POST', async () => {
    process.env.FEATURE_GITHUB_INTEGRATION = '1';
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    expect((await handlePlatformRoutes(url, post()))?.status).toBe(200);
    expect((await handlePlatformRoutes(url, post('sha256=bad')))?.status).toBe(403);
    expect((await handlePlatformRoutes(url, new Request(url)))?.status).toBe(405);
  });
});
