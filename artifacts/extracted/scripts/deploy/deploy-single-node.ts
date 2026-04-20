TypeScript

#!/usr/bin/env bun
import { $ } from 'bun';
import chalk from 'chalk';
import { writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

const SSH_HOST = process.env.SSH_HOST ?? '';
const SSH_USER = process.env.SSH_USER ?? 'autoorg';
const SSH_KEY = process.env.SSH_KEY ?? '';
const DEPLOY_SHA = process.env.DEPLOY_SHA ?? '';
const BUNDLE = `autoorg-${DEPLOY_SHA}.tar.gz`;

async function main() {
  console.log(chalk.cyan('\n🚀 Deploying to single-node...\n'));

  const keyFile = '/tmp/deploy-key';
  await writeFile(keyFile, SSH_KEY, { mode: 0o600 });
  await chmod(keyFile, 0o600);

  const sshBase = `ssh -o StrictHostKeyChecking=no -i ${keyFile} ${SSH_USER}@${SSH_HOST}`;

  await $`scp -o StrictHostKeyChecking=no -i ${keyFile} ${BUNDLE} ${SSH_USER}@${SSH_HOST}:/tmp/`;

  const deployScript = `
set -e
cd /opt/autoorg
tar -xzf /tmp/${BUNDLE} -C .
bun install --production
AUTOORG_VERSION=${DEPLOY_SHA} bun run src/db/migrate.ts
systemctl reload-or-restart autoorg-api || true
systemctl reload-or-restart autoorg-daemon || true
`.trim();

  await $`bash -c '${sshBase} "${deployScript}"'`;

  console.log(chalk.green('✅ Single-node deploy complete'));
}

main();