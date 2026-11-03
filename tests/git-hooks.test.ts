/**
 * Git hook tests — the hooks are documented as part of the setup
 * (`bun run setup:hooks` in README + CONTRIBUTING), so they must work on any
 * machine and must not reject AutoOrg's own commits.
 *
 * Two pre-existing bugs covered here:
 *   1. `commit-msg` rejects `autoorg-cycle-N: score=…` messages, which kills
 *      every ratchet commit — and, since A01, every approval materialization
 *      (approve → 500) — the moment hooks are installed.
 *   2. `pre-commit` invokes a hardcoded `/Users/macbookprom1pro/.bun/bin/bun`
 *      (fails on every other machine) and its `xargs grep` pipeline returns
 *      exit 123 on GNU/Linux for NO match, so the `if` falsely reports a
 *      secret on every clean commit.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const COMMIT_MSG_HOOK = path.join(REPO_ROOT, 'scripts', 'hooks', 'commit-msg');
const PRE_COMMIT_HOOK = path.join(REPO_ROOT, 'scripts', 'hooks', 'pre-commit');

const RATCHET_MESSAGE =
  'autoorg-cycle-1: score=0.9000 (prev=0.1000) [G:0.90 N:0.90 C:0.90 A:0.90]';

function runHook(hook: string, args: string[], cwd: string) {
  const res = spawnSync('bash', [hook, ...args], {
    cwd,
    encoding: 'utf-8',
    env: process.env,
    timeout: 60_000,
  });
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    output: (res.stdout ?? '') + (res.stderr ?? ''),
  };
}

let scratch: string;

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'autoorg-hooks-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('commit-msg hook', () => {
  function checkMessage(message: string) {
    const file = path.join(scratch, 'msg.txt');
    writeFileSync(file, message + '\n', 'utf-8');
    return runHook(COMMIT_MSG_HOOK, [file], REPO_ROOT);
  }

  it('accepts a conventional human message', () => {
    const res = checkMessage('feat(api): add health check');
    expect(res.status).toBe(0);
    expect(res.output).toContain('ok');
  });

  it('accepts AutoOrg ratchet commits (needed for cycles AND approval materialization)', () => {
    const res = checkMessage(RATCHET_MESSAGE);
    expect(res.status).toBe(0);
    expect(res.output).toContain('ok');
  });

  it('still rejects non-conventional human messages', () => {
    expect(checkMessage('stuff: hi').status).toBe(1);
    expect(checkMessage('no colon no type').status).toBe(1);
  });

  it('does not accept near-miss machine messages without a cycle number/score', () => {
    expect(checkMessage('autoorg-cycle-x: score=high').status).toBe(1);
    expect(checkMessage('autoorg-cycle-1: merged stuff').status).toBe(1);
  });
});

describe('pre-commit hook', () => {
  it('has no machine-specific absolute paths', () => {
    const script = readFileSync(PRE_COMMIT_HOOK, 'utf-8');
    expect(script).not.toMatch(/\/Users\//);
    expect(script).not.toMatch(/\/home\/[a-z]+\/\.bun/);
  });

  it('aborts when a staged file contains a secret', () => {
    const seed = path.join(scratch, 'secret-repo');
    mkdirSync(seed, { recursive: true });
    const run = (cmd: string) => spawnSync('bash', ['-c', cmd], { cwd: seed, encoding: 'utf-8' });
    run('git init -q');
    run('git config user.email t@t.local');
    run('git config user.name T');
    writeFileSync(path.join(seed, 'notes.md'), 'key: sk-ant-abcdefghijklmnopqrstuvwxyz123456\n');
    run('git add -A');

    const res = runHook(PRE_COMMIT_HOOK, [], seed);
    expect(res.status).toBe(1);
    expect(res.output).toContain('Potential secret');
  });

  it('passes on a clean index (typecheck via PATH bun, no xargs false positive)', () => {
    // Runs against the real checkout with an empty staged set — exactly the
    // case where the old hook hit the hardcoded bun path (non-mac machines)
    // and where GNU xargs' exit 123 produced a phantom secret match.
    const res = runHook(PRE_COMMIT_HOOK, [], REPO_ROOT);
    expect(res.status).toBe(0);
    expect(res.output).toContain('passed');
  }, 60_000);
});
