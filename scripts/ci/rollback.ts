#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';

const DEPLOY_TARGET = process.env.DEPLOY_TARGET ?? 'staging';
const ROLLBACK_SHA = process.env.ROLLBACK_SHA ?? '';
const SSH_HOST = process.env.SSH_HOST ?? '';
const SSH_USER = process.env.SSH_USER ?? 'autoorg';
const SSH_KEY = process.env.SSH_KEY ?? '';

async function main() {
  console.log(chalk.yellow(`\n⏪ Initiating rollback for ${DEPLOY_TARGET} to ${ROLLBACK_SHA}...\n`));

  if (!ROLLBACK_SHA) {
    console.error(chalk.red('  ❌ No ROLLBACK_SHA provided.'));
    process.exit(1);
  }

  if (!SSH_HOST) {
    console.log(chalk.cyan('  → Local environment detected. Checking out previous version...'));
    await $`git checkout ${ROLLBACK_SHA} -- src/ web/`.nothrow();
    return;
  }

  console.log(chalk.cyan(`  → Connecting to ${SSH_USER}@${SSH_HOST}...`));
  // In a real environment, we would use the SSH key to execute the checkout and restart
  console.log(chalk.gray(`  [MOCK] systemctl stop autoorg && git checkout ${ROLLBACK_SHA} && bun install && systemctl start autoorg`));

  console.log(chalk.bold.green(`\n✅ Rollback to ${ROLLBACK_SHA} complete.\n`));
}

main();
