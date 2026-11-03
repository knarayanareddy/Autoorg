#!/usr/bin/env bun
/**
 * Rollback a deployment.
 *
 * The previous version printed `[MOCK] systemctl stop autoorg && …` and then
 * "✅ Rollback complete", so a failed deploy reported success and CI went green.
 * A rollback that silently does nothing is worse than no rollback, so:
 *
 *   - local mode actually reverts the working tree and verifies it,
 *   - remote mode refuses to run until an implementation exists, unless
 *     AUTOORG_ALLOW_MOCK_ROLLBACK=1 is explicitly set.
 */

import { $ } from 'bun';
import chalk from 'chalk';

const DEPLOY_TARGET = process.env.DEPLOY_TARGET ?? 'staging';
const ROLLBACK_SHA = process.env.ROLLBACK_SHA ?? '';
const SSH_HOST = process.env.SSH_HOST ?? '';
const ALLOW_MOCK = process.env.AUTOORG_ALLOW_MOCK_ROLLBACK === '1';

async function main() {
  console.log(chalk.yellow(`\n⏪ Initiating rollback for ${DEPLOY_TARGET} to ${ROLLBACK_SHA || '(none)'}...\n`));

  if (!ROLLBACK_SHA) {
    console.error(chalk.red('  ❌ No ROLLBACK_SHA provided.'));
    process.exit(1);
  }

  // ── Local mode ────────────────────────────────────────────────────
  if (!SSH_HOST) {
    console.log(chalk.cyan(`  → Local environment: restoring src/ and web/ from ${ROLLBACK_SHA}...`));

    const verify = await $`git rev-parse --verify ${ROLLBACK_SHA}^{commit}`.nothrow();
    if (verify.exitCode !== 0) {
      console.error(chalk.red(`  ❌ Unknown revision: ${ROLLBACK_SHA}`));
      process.exit(1);
    }

    const checkout = await $`git checkout ${ROLLBACK_SHA} -- src/ web/ dist/`.nothrow();
    if (checkout.exitCode !== 0) {
      console.error(chalk.red('  ❌ git checkout failed'));
      if (checkout.stderr) console.error(chalk.gray(checkout.stderr.toString().trim()));
      process.exit(1);
    }

    console.log(chalk.green(`  ✅ Working tree restored to ${ROLLBACK_SHA}.`));
    console.log(chalk.gray('     (Files are staged; commit to make the rollback permanent.)'));
    return;
  }

  // ── Remote mode ───────────────────────────────────────────────────
  if (!ALLOW_MOCK) {
    console.error(chalk.red(
      '\n  ❌ Remote rollback is not implemented.\n' +
      '     Refusing to report success for an action that did nothing.\n' +
      '     Set AUTOORG_ALLOW_MOCK_ROLLBACK=1 to acknowledge a manual rollback,\n' +
      '     or implement the SSH step below.\n'
    ));
    process.exit(1);
  }

  console.log(chalk.cyan(`  → Connecting to ${SSH_HOST}...`));
  console.log(chalk.gray(
    '  [MOCK — manually verified] systemctl stop autoorg && ' +
    `git checkout ${ROLLBACK_SHA} && bun install && systemctl start autoorg`
  ));
  console.log(chalk.yellow('\n  ⚠  Mock mode: this did NOT roll anything back.\n'));
}

main();
