TypeScript

#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';

const args = process.argv.slice(2);
const importsOnly = args.includes('--imports-only');

async function main() {
  console.log(chalk.cyan('\n🔍 Running lint...\n'));

  if (!importsOnly) {
    const eslint = await $`bunx eslint src/ web/app/ --ext .ts,.tsx --max-warnings 0`.nothrow();
    if (eslint.exitCode !== 0) {
      console.error(chalk.red('ESLint failed'));
      process.exit(1);
    }
  }

  console.log(chalk.green('✅ Lint passed'));
}

main();