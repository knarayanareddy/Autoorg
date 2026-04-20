/**
 * AutoOrg Git Utilities
 * Git is the audit trail. Every COMMIT is a validated improvement.
 * Every REVERT is a rejected experiment.
 * 
 * This is the exact pattern from AutoResearch:
 * "If the score improved, commit. If not, git reset --hard HEAD."
 */

import simpleGit, { type SimpleGit } from 'simple-git';
import chalk from 'chalk';

let gitInstance: SimpleGit | null = null;

function git(): SimpleGit {
  if (!gitInstance) {
    gitInstance = simpleGit(process.cwd(), {
      config: [
        `user.name=${process.env.GIT_AUTHOR_NAME ?? 'AutoOrg'}`,
        `user.email=${process.env.GIT_AUTHOR_EMAIL ?? 'autoorg@localhost'}`,
      ],
    });
  }
  return gitInstance;
}

export async function gitInit(): Promise<void> {
  try {
    await git().revparse(['--git-dir']);
  } catch {
    await git().init();
    console.log(chalk.green('  ✓ Git repository initialized'));
  }
}

export async function gitAdd(files: string[]): Promise<void> {
  await git().add(files);
}

export async function gitCommit(message: string): Promise<string> {
  await git().add([
    'workspace/current_output.md',
    'memory/MEMORY.md',
    'memory/facts/',
    'results.tsv',
  ]);
  
  const result = await git().commit(message, {
    '--allow-empty': null,
  });
  
  return result.commit;
}

export async function gitReset(): Promise<void> {
  await git().reset(['--hard', 'HEAD']);
}

export async function gitCurrentHash(): Promise<string> {
  try {
    const log = await git().log({ maxCount: 1 });
    return log.latest?.hash ?? 'initial';
  } catch {
    return 'no-commits';
  }
}

export async function gitTag(tagName: string, message: string): Promise<void> {
  await git().tag(['-a', tagName, '-m', message]);
}

export async function gitLog(maxCount = 10): Promise<Array<{
  hash: string;
  message: string;
  date: string;
}>> {
  const log = await git().log({ maxCount });
  return (log.all ?? []).map(entry => ({
    hash: entry.hash.slice(0, 8),
    message: entry.message,
    date: entry.date,
  }));
}

export async function getWorkspaceStatus(): Promise<{
  isClean: boolean;
  modified: string[];
}> {
  const status = await git().status();
  return {
    isClean: status.isClean(),
    modified: status.modified,
  };
}

export async function gitPush(): Promise<void> {
  try {
    await git().push();
  } catch (err) {
    console.warn(chalk.yellow(`  ⚠  Git push failed (possibly no remote): ${err}`));
  }
}

export async function gitCheckout(ref: string): Promise<void> {
  await git().checkout(ref);
}
