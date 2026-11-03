import { describe, it, expect } from 'bun:test';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

describe('deployment and health safety', () => {
  it('fails closed rather than pretending a missing-key deploy succeeded', () => {
    const result = spawnSync(process.execPath, ['run', 'scripts/deploy/deploy-single-node.ts'], {
      env: { ...process.env, SSH_KEY: '' }, encoding: 'utf8', timeout: 5000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain('deploy complete');
  });
  it('sends the configured API key to a health endpoint', async () => {
    const key = 'synthetic-health-key';
    const server = createServer((req, res) => {
      res.statusCode = req.headers.authorization === `Bearer ${key}` ? 200 : 401;
      res.setHeader('Content-Type', 'application/json');
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const child = spawn(process.execPath, ['run', 'scripts/ci/health-check.ts'], {
        env: { ...process.env, AUTOORG_API_URL: `http://127.0.0.1:${port}`, AUTOORG_API_KEY: key },
        stdio: 'ignore',
      });
      const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
      expect(code).toBe(0);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
