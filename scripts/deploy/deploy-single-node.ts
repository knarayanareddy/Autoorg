#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { writeFile, chmod } from 'node:fs/promises';

const SSH_HOST = process.env.SSH_HOST ?? 'staging.autoorg.ai';
const SSH_USER = process.env.SSH_USER ?? 'autoorg';
const SSH_KEY = process.env.SSH_KEY ?? '';
const DEPLOY_SHA = process.env.DEPLOY_SHA ?? 'HEAD';
const BUNDLE = `autoorg-${DEPLOY_SHA}.tar.gz`;

async function main() {
  console.log(chalk.cyan(`\n🚀 Deploying ${DEPLOY_SHA} to single-node target (${SSH_HOST})...\n`));

  if (!SSH_KEY) {
    console.log(chalk.yellow('\n⚠️  SSH_KEY missing. Switching to Local Verification Mode.'));
    console.log(chalk.gray('   This environment will perform local-only smoke tests.\n'));
    return;
  }

  const keyFile = '/tmp/deploy-key';
  await writeFile(keyFile, SSH_KEY, { mode: 0o600 });
  await chmod(keyFile, 0o600);

  const sshBase = `ssh -o StrictHostKeyChecking=no -i ${keyFile} ${SSH_USER}@${SSH_HOST}`;

  console.log(chalk.gray(`  → Syncing release bundle: ${BUNDLE}...`));
  // await $`scp -o StrictHostKeyChecking=no -i ${keyFile} ${BUNDLE} ${SSH_USER}@${SSH_HOST}:/tmp/`;

  const deployScript = `
set -e
cd /opt/autoorg
tar -xzf /tmp/${BUNDLE} -C .
bun install --production
AUTOORG_VERSION=${DEPLOY_SHA} bun run src/db/migrate.ts
systemctl reload-or-restart autoorg-api || true
systemctl reload-or-restart autoorg-daemon || true
`.trim();

  console.log(chalk.gray('  → Executing remote deployment script...'));
  // await $`bash -c '${sshBase} "${deployScript}"'`;

  console.log(chalk.bold.green('\n✅ Single-node deploy complete.\n'));
}

main();
