TypeScript

#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';

async function main() {
  console.log(chalk.cyan('\n🚀 Deploying locally...\n'));
  await $`bun install`;
  await $`bun run src/db/migrate.ts`;
  console.log(chalk.green('✅ Local deploy ready. Run: bun start'));
}

main();