import { describe, it, expect, afterEach } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const script = path.resolve('src/scripts/init-api-key.ts');
const dirs: string[] = [];
function fixture() { const dir = mkdtempSync(path.join(tmpdir(), 'autoorg-key-init-')); dirs.push(dir); return dir; }
function run(dir: string) { return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' }); }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('local API key initialization', () => {
  it('generates a strong secret without printing it and preserves other settings', () => {
    const dir = fixture();
    const file = path.join(dir, '.env');
    writeFileSync(file, '# settings\nOTHER=value\nAUTOORG_API_KEY=\n');
    const result = run(dir);
    expect(result.status).toBe(0);
    const contents = readFileSync(file, 'utf8');
    const key = contents.match(/^AUTOORG_API_KEY=([a-f0-9]{64})$/m)?.[1];
    expect(key).toBeTruthy();
    expect(contents).toContain('OTHER=value');
    expect(result.stdout + result.stderr).not.toContain(key!);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  it('does not replace an existing key or follow a symlink', () => {
    const dir = fixture();
    const file = path.join(dir, '.env');
    const existing = 'AUTOORG_API_KEY=local-existing-test-value\n';
    writeFileSync(file, existing);
    expect(run(dir).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(existing);
    rmSync(file);
    const target = path.join(dir, 'target');
    writeFileSync(target, 'unchanged');
    symlinkSync(target, file);
    expect(run(dir).status).not.toBe(0);
    expect(readFileSync(target, 'utf8')).toBe('unchanged');
  });
});
