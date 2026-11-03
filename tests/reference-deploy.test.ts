import { describe, it, expect, afterEach } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';

const dirs: string[] = [];
const apply = path.resolve('scripts/deploy/apply-release.sh');
const rollback = path.resolve('scripts/deploy/rollback-release.sh');
const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-ref-deploy-')); dirs.push(dir);
  const root = path.join(dir, 'root'); const bin = path.join(dir, 'bin');
  for (const item of ['releases', 'incoming', 'shared', 'shared/backups']) mkdirSync(path.join(root, item), { recursive: true });
  mkdirSync(bin);
  mkdirSync(path.join(root, 'releases', oldSha));
  symlinkSync(path.join(root, 'releases', oldSha), path.join(root, 'current'));
  writeFileSync(path.join(root, 'shared', 'autoorg.env'), 'AUTOORG_API_KEY=synthetic\n', { mode: 0o600 });
  const source = path.join(dir, 'source'); mkdirSync(path.join(source, 'web'), { recursive: true });
  writeFileSync(path.join(source, 'package.json'), '{}');
  const archive = path.join(root, 'incoming', `${newSha}.tar`);
  const tar = spawnSync('tar', ['-cf', archive, '-C', source, '.']);
  if (tar.status !== 0) throw new Error('fixture tar failed');
  const log = path.join(dir, 'commands.log');
  writeFileSync(path.join(bin, 'bun'), '#!/bin/sh\necho "bun $*" >> "$TEST_LOG"\ncase "$*" in *db:migrate*) [ "${FAIL_MIGRATION:-0}" != 1 ] || exit 1;; *health-check*) [ "${FAIL_HEALTH:-0}" != 1 ] || exit 1;; esac\nexit 0\n', { mode: 0o755 });
  writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(path.join(bin, 'sudo'), '#!/bin/sh\necho "sudo $*" >> "$TEST_LOG"\ncase "$*" in *restart*) [ "${FAIL_RESTART:-0}" != 1 ] || exit 1;; esac\nexit 0\n', { mode: 0o755 });
  const env = { ...process.env, AUTOORG_DEPLOY_ROOT: root, PATH: `${bin}:/usr/bin:/bin`, TEST_LOG: log, AUTOORG_HEALTH_ATTEMPTS: '1' };
  return { root, env, log };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('reference deployment on an isolated filesystem', () => {
  it('builds, migrates, switches the release and checks health', () => {
    const { root, env, log } = setup();
    const result = spawnSync('bash', [apply, newSha], { env, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(0);
    expect(readlinkSync(path.join(root, 'current'))).toBe(path.join(root, 'releases', newSha));
    const commands = readFileSync(log, 'utf8');
    expect(commands).toContain('db:migrate');
    expect(commands).toContain('health-check');
    expect(commands).toContain('systemctl restart');
  });
  it('does not switch releases or pretend to roll back on migration failure', () => {
    const { root, env } = setup();
    const result = spawnSync('bash', [apply, newSha], { env: { ...env, FAIL_MIGRATION: '1' }, encoding: 'utf8', timeout: 10000 });
    expect(result.status).not.toBe(0);
    expect(readlinkSync(path.join(root, 'current'))).toBe(path.join(root, 'releases', oldSha));
  });
  it('stops services after a failed health check without restoring the database', () => {
    const { root, env, log } = setup();
    const result = spawnSync('bash', [apply, newSha], { env: { ...env, FAIL_HEALTH: '1' }, encoding: 'utf8', timeout: 10000 });
    expect(result.status).not.toBe(0);
    expect(readlinkSync(path.join(root, 'current'))).toBe(path.join(root, 'releases', newSha));
    expect(readFileSync(log, 'utf8').match(/systemctl stop/g)).toHaveLength(2);
  });
  it('stops services again if restart fails', () => {
    const { env, log } = setup();
    const result = spawnSync('bash', [apply, newSha], { env: { ...env, FAIL_RESTART: '1' }, encoding: 'utf8', timeout: 10000 });
    expect(result.status).not.toBe(0);
    expect(readFileSync(log, 'utf8').match(/systemctl stop/g)).toHaveLength(2);
  });
  it('requires explicit acknowledgement before a code-only rollback', () => {
    const { root, env } = setup();
    const denied = spawnSync('bash', [rollback, oldSha], { env, encoding: 'utf8', timeout: 10000 });
    expect(denied.status).not.toBe(0);
    const allowed = spawnSync('bash', [rollback, oldSha], { env: { ...env, AUTOORG_ACK_CODE_ONLY_ROLLBACK: '1' }, encoding: 'utf8', timeout: 10000 });
    expect(allowed.status).toBe(0);
    expect(readlinkSync(path.join(root, 'current'))).toBe(path.join(root, 'releases', oldSha));
  });
});


describe('SQLite backup', () => {
  it('refuses dangling symlink destinations', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-ref-link-')); dirs.push(dir);
    const source = path.join(dir, 'source.db');
    const db = new Database(source); db.run('CREATE TABLE sample (v TEXT)'); db.close();
    const target = path.join(dir, 'must-not-be-created.db');
    const link = path.join(dir, 'backup.db'); symlinkSync(target, link);
    const result = spawnSync(process.execPath, [path.resolve('scripts/deploy/backup-database.ts'), source, link]);
    expect(result.status).not.toBe(0);
    expect(require('node:fs').existsSync(target)).toBe(false);
  });
  it('takes a consistent snapshot of committed WAL data and refuses overwrite', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-ref-backup-')); dirs.push(dir);
    const source = path.join(dir, 'source.db');
    const dest = path.join(dir, 'backup.db');
    const db = new Database(source);
    try {
      db.run('PRAGMA journal_mode=WAL');
      db.run('CREATE TABLE sample (v TEXT)');
      db.run("INSERT INTO sample VALUES ('fixture')");
      const command = path.resolve('scripts/deploy/backup-database.ts');
      expect(spawnSync(process.execPath, [command, source, dest]).status).toBe(0);
      const backup = new Database(dest, { readonly: true });
      try { expect(backup.query('SELECT v FROM sample').get()).toEqual({ v: 'fixture' }); } finally { backup.close(); }
      expect(spawnSync(process.execPath, [command, source, dest]).status).not.toBe(0);
    } finally { db.close(); }
  });
});
