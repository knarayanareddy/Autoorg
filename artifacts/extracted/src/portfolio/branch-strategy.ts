TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import simpleGit from 'simple-git';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';

export class BranchStrategy {
  private git = simpleGit();
  private locks = new WorkspaceLock();

  async prepare(opts: {
    portfolioRunId: string;
    variantKey: string;
  }) {
    const branchName = `portfolio/${opts.portfolioRunId}/${opts.variantKey}`;
    const worktreePath = path.join(
      process.cwd(),
      'artifacts',
      'portfolio',
      'runs',
      opts.portfolioRunId,
      opts.variantKey
    );

    await mkdir(worktreePath, { recursive: true });

    try {
      await this.git.raw(['worktree', 'remove', '--force', worktreePath]);
    } catch {}

    try {
      await this.git.raw(['branch', '-D', branchName]);
    } catch {}

    await this.git.raw(['worktree', 'add', '-B', branchName, worktreePath, 'HEAD']);

    return { branchName, worktreePath };
  }

  async withVariantLock<T>(
    worktreePath: string,
    holderId: string,
    runId: string,
    fn: () => Promise<T>,
  ) {
    return this.locks.withLock(`worktree:${worktreePath}`, holderId, runId, fn, 90_000);
  }

  async cleanup(worktreePath: string) {
    try {
      await this.git.raw(['worktree', 'remove', '--force', worktreePath]);
    } catch {}
  }
}
4. Failure containment
If a variant:

exceeds budget,
enters a crash loop,
produces critical security findings,
attempts approval bypass,
corrupts workspace, then the portfolio should quarantine or kill it without affecting others.