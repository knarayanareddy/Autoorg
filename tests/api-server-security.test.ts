import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server: ChildProcess;
let port: number;
let dir: string;

beforeAll(async () => {
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  port = (listener.address() as { port: number }).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  dir = mkdtempSync(path.join(tmpdir(), 'autoorg-api-test-'));
  const env = { ...process.env, API_PORT: String(port), API_HOST: '127.0.0.1', AUTOORG_API_KEY: 'integration-secret', AUTOORG_DB_PATH: path.join(dir, 'test.db') };
  const migration = spawnSync(process.execPath, ['run', 'db:migrate'], { env });
  if (migration.status !== 0) throw new Error(`migration failed: ${migration.stderr}`);
  server = spawn(process.execPath, ['run', 'src/api/server.ts'], {
    env,
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`server exited: ${server.exitCode}`);
    try { await fetch(`http://127.0.0.1:${port}/health`); return; } catch { await Bun.sleep(50); }
  }
  throw new Error('server did not start');
});
afterAll(async () => {
  if (server && server.exitCode === null) {
    const done = new Promise<void>(resolve => server.once('exit', () => resolve()));
    server.kill();
    await done;
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('API server security', () => {
  it('sends security headers on ordinary, preflight and error responses', async () => {
    for (const [path, options] of [
      ['/health', {}],
      ['/api/interview', { method: 'OPTIONS' }],
      ['/api/interview', { method: 'POST', body: '{}' }],
    ] as const) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, options);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    }
  });
  it('protects read endpoints with the configured key', async () => {
    expect((await fetch(`http://127.0.0.1:${port}/api/runs`)).status).toBe(401);
    const res = await fetch(`http://127.0.0.1:${port}/api/runs`, { headers: { 'x-api-key': 'integration-secret' } });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
  it('returns 400 for malformed JSON without echoing input', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/interview`, { method: 'POST', headers: { 'x-api-key': 'integration-secret' }, body: '{"private":"oops' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });
  it('limits a chunked request even without content-length', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/interview', method: 'POST', headers: { 'x-api-key': 'integration-secret' } }, res => {
        res.resume(); resolve(res.statusCode!);
      });
      req.on('error', reject);
      for (let i = 0; i < 17; i++) req.write('a'.repeat(65536));
      req.end();
    });
    expect(status).toBe(413);
  });
  it('authorizes WebSocket upgrades before sending events', async () => {
    const connect = (path: string) => new Promise<boolean>(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
      ws.onopen = () => { ws.close(); resolve(true); };
      ws.onerror = () => resolve(false);
    });
    expect(await connect('/ws')).toBe(false);
    expect(await connect('/ws?token=integration-secret')).toBe(true);
    expect(await connect('/other?token=integration-secret')).toBe(false);
  });
  it('throttles failed authentication without throttling signed-webhook handling', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/interview`, { method: 'POST', headers: { 'x-api-key': 'wrong' }, body: '{}' });
      expect(res.status).toBe(403);
    }
    const blocked = await fetch(`http://127.0.0.1:${port}/api/interview`, { method: 'POST', headers: { 'x-api-key': 'integration-secret' }, body: '{}' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    const webhook = await fetch(`http://127.0.0.1:${port}/api/webhooks/github`, { method: 'POST', body: '{}' });
    expect(webhook.status).not.toBe(429);
  });

});
