import { describe, it, expect } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('tooling configuration', () => {
  it('provides an installed, enforceable lint configuration', () => {
    expect(existsSync('eslint.config.js')).toBe(true);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies.eslint).toBeTruthy();
    const lint = readFileSync('scripts/ci/lint.ts', 'utf8');
    expect(lint).not.toContain('skipping (nothing to enforce)');
  });
  it('actually rejects a debugger statement', () => {
    const result = spawnSync(process.execPath, ['./node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', 'src/lint-fixture.ts'], { input: 'debugger;', encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('no-debugger');
  });
  it('pins the Bun version used by CI', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).not.toContain('bun-version: latest');
    expect(ci).toContain('bun-version: 1.4.4');
  });
});
