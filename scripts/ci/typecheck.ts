#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';

const args = process.argv.slice(2);
const projectIdx = args.indexOf('--project');
const project = projectIdx !== -1 ? args[projectIdx + 1] : 'tsconfig.json';

async function main() {
  console.log(chalk.cyan(`\n🔍 Running typecheck on ${project}...\n`));

  const result = await $`bunx tsc --noEmit --project ${project}`.nothrow();
  if (result.exitCode !== 0) {
    console.error(chalk.red(`TypeCheck failed for ${project}`));
    process.exit(1);
  }

  console.log(chalk.green(`✅ TypeCheck passed: ${project}`));
}

main();
