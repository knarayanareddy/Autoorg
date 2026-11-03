import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConstitutionGuard, assertConstitutionSafeTool } from '../src/runtime/constitution-lock';

const dir = mkdtempSync(path.join(tmpdir(), 'constitution-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
describe('constitution lock', () => {
  it('detects changes, deletion and symlink substitution without overwriting them', () => {
    const file = path.join(dir, 'constitution.md');
    writeFileSync(file, 'original');
    const guard = new ConstitutionGuard(dir);
    guard.assertUnchanged();
    writeFileSync(file, 'changed');
    expect(() => guard.assertUnchanged()).toThrow(/constitution/i);
    expect(require('node:fs').readFileSync(file, 'utf8')).toBe('changed');
    rmSync(file);
    expect(() => guard.assertUnchanged()).toThrow(/constitution/i);
    const other = path.join(dir, 'other'); writeFileSync(other, 'original');
    symlinkSync(other, file);
    expect(() => guard.assertUnchanged()).toThrow(/constitution/i);
  });
  it('rejects writable or unknown tools while permitting built-in read tools', () => {
    const assertSafeTool = assertConstitutionSafeTool;
    expect(() => assertSafeTool('sandbox.exec')).toThrow(/constitution/i);
    expect(() => assertSafeTool('unknown')).toThrow(/constitution/i);
    expect(() => assertSafeTool('repo.search')).not.toThrow();
    expect(() => assertSafeTool('web.fetch')).not.toThrow();
  });
});
