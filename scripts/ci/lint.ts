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

  if (!existsSync('eslint.config.js')) {
    console.error(chalk.red('Missing ESLint configuration'));
    process.exit(1);
  }

  const result = await $`bun ./node_modules/eslint/bin/eslint.js src/ web/app/ web/components/ web/lib/ --max-warnings 0`.nothrow();

  if (result.exitCode !== 0) {
    console.error(chalk.red('\n❌ ESLint failed\n'));
    process.exit(1);
  }

  console.log(chalk.green('✅ Lint check complete'));
}

main();
