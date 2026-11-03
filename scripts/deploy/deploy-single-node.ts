#!/usr/bin/env bun
/** SSH transport for the documented, pre-provisioned reference staging VM. */
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const host = process.env.SSH_HOST ?? '';
const user = process.env.SSH_USER ?? '';
const key = process.env.SSH_KEY ?? '';
const knownHosts = process.env.SSH_KNOWN_HOSTS ?? '';
const port = process.env.SSH_PORT ?? '22';
const args = process.argv.slice(2);
const rollback = args[0] === '--rollback';
const sha = rollback ? args[1] ?? '' : process.env.DEPLOY_SHA ?? '';
const valid = /^[a-f0-9]{40}$/.test(sha) && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(host) && !host.includes('..') && /^[a-z_][a-z0-9_-]{0,31}$/i.test(user) && /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535 && !!key.trim() && !!knownHosts.trim();
if (!valid || (rollback ? args.length !== 2 || process.env.AUTOORG_ACK_CODE_ONLY_ROLLBACK !== '1' : args.length !== 0)) {
  console.error('Invalid or missing deployment configuration, or rollback acknowledgement. No remote system was changed.');
  process.exit(1);
}
// Avoid passing deployment credentials to git, ssh or scp in their environment.
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG };
const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-deploy-'));
try {
  const keyFile = path.join(dir, 'identity');
  const hostsFile = path.join(dir, 'known_hosts');
  writeFileSync(keyFile, key, { mode: 0o600, flag: 'wx' });
  writeFileSync(hostsFile, knownHosts.endsWith('\n') ? knownHosts : `${knownHosts}\n`, { mode: 0o600, flag: 'wx' });
  const options = ['-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${hostsFile}`, '-i', keyFile];
  const target = `${user}@${host}`;
  function run(executable: string, argv: string[], stdoutFd?: number): string {
    const result = spawnSync(executable, argv, {
      env, encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', stdoutFd ?? 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0) throw new Error(`${executable} failed`);
    return result.stdout ?? '';
  }
  if (!rollback) {
    const head = run('git', ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    if (head !== sha) throw new Error('DEPLOY_SHA does not match the checked-out commit');
    const archive = path.join(dir, 'release.tar');
    const fd = openSync(archive, 'wx', 0o600);
    try { run('git', ['archive', '--format=tar', sha, '--', 'src', 'scripts', 'web', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'eslint.config.js'], fd); } finally { closeSync(fd); }
    run('scp', [...options, '-P', port, archive, `${target}:/opt/autoorg/incoming/${sha}.tar`]);
    run('ssh', [...options, '-p', port, target, 'bash', '/usr/local/libexec/autoorg/apply-release.sh', sha]);
    console.log(`Reference release ${sha} deployed and health-checked.`);
  } else {
    run('ssh', [...options, '-p', port, target, 'env', 'AUTOORG_ACK_CODE_ONLY_ROLLBACK=1', 'bash', '/usr/local/libexec/autoorg/rollback-release.sh', sha]);
    console.log(`Code rolled back to ${sha}; database was not restored.`);
  }
} catch (error) {
  console.error(`Deployment operation failed: ${error instanceof Error ? error.message : 'unknown error'}. Check the staging host before recovery.`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
