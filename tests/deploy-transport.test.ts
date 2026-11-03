import { describe, it, expect, afterEach } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dirs: string[] = [];
const sha = 'a'.repeat(40);
const script = path.resolve('scripts/deploy/deploy-single-node.ts');
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-ssh-fixture-')); dirs.push(dir);
  const bin = path.join(dir, 'bin'); mkdirSync(bin);
  const log = path.join(dir, 'log');
  writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase "$1" in rev-parse) echo ${sha};; archive) printf 'fake archive';; *) exit 1;; esac\n`, { mode: 0o755 });
  for (const name of ['ssh', 'scp']) writeFileSync(path.join(bin, name), `#!/bin/sh\necho '${name}' "$@" >> '${log}'\nexit 0\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, TEST_LOG: log, SSH_HOST: 'staging.example', SSH_USER: 'autoorg', SSH_KEY: 'synthetic-private-key', SSH_KNOWN_HOSTS: 'staging.example synthetic-host-key', DEPLOY_SHA: sha };
  return { dir, bin, env, log };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('staging SSH transport', () => {
  it('uses strict pinned host keys and uploads the exact checked-out commit', () => {
    const { env, log } = fixture();
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 5000 });
    expect(result.status).toBe(0);
    const commands = readFileSync(log, 'utf8');
    expect(commands).toContain('StrictHostKeyChecking=yes');
    expect(commands).toContain('UserKnownHostsFile=');
    expect(commands).toContain(`/opt/autoorg/incoming/${sha}.tar`);
    expect(commands).toContain(`/usr/local/libexec/autoorg/apply-release.sh ${sha}`);
    expect(result.stdout + result.stderr + commands).not.toContain('synthetic-private-key');
  });
  it('never invokes remote apply if upload fails', () => {
    const { env, log, bin } = fixture();
    writeFileSync(path.join(bin, 'scp'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  });
  it('requires explicit acknowledgement for code-only rollback', () => {
    const { env, log } = fixture();
    expect(spawnSync(process.execPath, [script, '--rollback', sha], { env }).status).not.toBe(0);
    expect(spawnSync(process.execPath, [script, '--rollback', sha], { env: { ...env, AUTOORG_ACK_CODE_ONLY_ROLLBACK: '1' } }).status).toBe(0);
    const commands = readFileSync(log, 'utf8');
    expect(commands).toContain('AUTOORG_ACK_CODE_ONLY_ROLLBACK=1');
    expect(commands).toContain(`/usr/local/libexec/autoorg/rollback-release.sh ${sha}`);
    expect(commands).not.toContain('scp ');
  });
  it('refuses unsafe hostnames and mismatched revisions before connecting', () => {
    const { env, log } = fixture();
    const badHost = spawnSync(process.execPath, [script], { env: { ...env, SSH_HOST: '-oProxyCommand=bad' }, encoding: 'utf8' });
    expect(badHost.status).not.toBe(0);
    const badSha = spawnSync(process.execPath, [script], { env: { ...env, DEPLOY_SHA: 'b'.repeat(40) }, encoding: 'utf8' });
    expect(badSha.status).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  });
});
