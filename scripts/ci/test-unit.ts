#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { mkdir } from 'node:fs/promises';

async function main() {
  console.log(chalk.cyan('\n🔬 Running unit tests...\n'));

  await mkdir('test-results', { recursive: true });

  const result = await $`bun test tests/ --timeout 30000 --reporter junit --reporter-outfile test-results/junit.xml`.nothrow();

  if (result.exitCode !== 0) {
    console.error(chalk.red('Unit tests failed'));
    process.exit(1);
  }

  console.log(chalk.green('✅ All unit tests passed'));
}

main();
