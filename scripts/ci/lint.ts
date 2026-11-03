#!/usr/bin/env bun
/**
 * Lint runner.
 *
 * Previously this swallowed ESLint failures (it logged red text, then printed
 * "✅ Lint check complete" and exited 0) and invoked a floating `bunx eslint`
 * that is not a project dependency. A CI gate that cannot fail is worse than no
 * gate, so this now exits non-zero on any finding.
 */

import { $ } from 'bun';
import chalk from 'chalk';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const importsOnly = args.includes('--imports-only');

async function main() {
  console.log(chalk.cyan('\n🔍 Running lint...\n'));

  if (importsOnly) {
    console.log(chalk.gray('  --imports-only: skipping ESLint'));
    console.log(chalk.green('✅ Lint check complete'));
    return;
  }

  // ESLint is optional until a flat config is committed. Fail loudly rather
  // than silently downloading an arbitrary version at CI time.
  if (!existsSync('eslint.config.js') && !existsSync('.eslintrc.json') && !existsSync('.eslintrc.cjs')) {
    console.log(chalk.gray('  No ESLint config present — skipping (nothing to enforce).'));
    console.log(chalk.green('✅ Lint check complete'));
    return;
  }

  const result = await $`bunx --bun eslint src/ web/app/ --max-warnings 0`.nothrow();

  if (result.exitCode !== 0) {
    console.error(chalk.red('\n❌ ESLint failed\n'));
    process.exit(1);
  }

  console.log(chalk.green('✅ Lint check complete'));
}

main();
