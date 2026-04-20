import { $ } from 'bun';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

export interface ProvisionOptions {
  workspaceId: string;
  repoUrl?: string;
  branchName?: string;
}

export class GitWorktreeProvider {
  constructor(private baseDir: string = './workspaces') {}

  async provision(opts: ProvisionOptions) {
    const worktreePath = path.join(process.cwd(), this.baseDir, opts.workspaceId);
    await mkdir(path.join(process.cwd(), this.baseDir), { recursive: true });

    if (opts.repoUrl) {
       // Shared repo pattern: clone to a 'cache' if not exists, then worktree from there
       const cachePath = path.join(process.cwd(), 'artifacts/repo_cache', opts.workspaceId);
       await mkdir(path.dirname(cachePath), { recursive: true });
       
       await $`git clone --bare ${opts.repoUrl} ${cachePath}`.quiet().nothrow();
       await $`git -C ${cachePath} worktree add ${worktreePath} ${opts.branchName ?? 'main'}`.quiet();
    } else {
       // Local directory pattern: just mkdir and git init
       await mkdir(worktreePath, { recursive: true });
       await $`git -C ${worktreePath} init`.quiet();
       await $`git -C ${worktreePath} checkout -b main`.quiet().nothrow();
    }

    return { rootPath: worktreePath };
  }

  async cleanup(workspaceId: string) {
    const worktreePath = path.join(process.cwd(), this.baseDir, workspaceId);
    await $`git worktree remove ${worktreePath}`.quiet().nothrow();
    await rm(worktreePath, { recursive: true, force: true });
  }
}
