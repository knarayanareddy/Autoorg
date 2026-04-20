import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import simpleGit from 'simple-git';

export class BranchStrategy {
  private git = simpleGit();

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

    await mkdir(path.dirname(worktreePath), { recursive: true });

    // 1. Remove worktree if exists (cleanup previous failed runs)
    try {
      await this.git.raw(['worktree', 'remove', '--force', worktreePath]);
    } catch {}

    // 2. Delete branch if exists
    try {
      await this.git.raw(['branch', '-D', branchName]);
    } catch {}

    // 3. Create new worktree
    // We check out a new branch based on current HEAD
    await this.git.raw(['worktree', 'add', '-B', branchName, worktreePath, 'HEAD']);

    // 4. Per User Decision: Separate DB file for isolation
    // Clone current DB into the worktree path (optional, but requested for total isolation)
    const dbPath = path.join(process.cwd(), 'autoorg.db');
    const variantDbPath = path.join(worktreePath, 'autoorg.db');
    try {
      await copyFile(dbPath, variantDbPath);
    } catch (err) {
      console.warn(`Failed to clone DB for variant ${opts.variantKey}:`, err);
    }

    return { branchName, worktreePath, variantDbPath };
  }

  async cleanup(worktreePath: string) {
    try {
      await this.git.raw(['worktree', 'remove', '--force', worktreePath]);
    } catch {}
  }
}
