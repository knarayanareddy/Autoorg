TypeScript

#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';

const DEPLOY_TARGET = process.env.DEPLOY_TARGET ?? 'staging';
const ROLLBACK_SHA = process.env.ROLLBACK_SHA ?? '';
const SSH_HOST = process.env.SSH_HOST ?? '';
const SSH_USER = process.env.SSH_USER ?? '';
const SSH_KEY = process.env.SSH_KEY ?? '';

async function main() {
  console.log(chalk.yellow(`\n⏪ Rolling back ${DEPLOY_TARGET} to ${ROLLBACK_SHA}...\n`));

  if (!ROLLBACK_SHA) {
    console.error(chalk.red('No ROLLBACK_SHA provided'));
    process.exit(1);
  }

  if (!SSH_HOST) {
    console.log(chalk.cyan('Local rollback only'));
    await $`git checkout ${ROLLBACK_SHA} -- src/ web/`.nothrow();
    return;
  }

  await $`ssh -o StrictHostKeyChecking=no -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST} "cd /opt/autoorg && git checkout ${ROLLBACK_SHA} && bun install && systemctl restart autoorg"`.nothrow();

  console.log(chalk.green(`✅ Rollback to ${ROLLBACK_SHA} complete`));
}

main();
13. Deploy scripts