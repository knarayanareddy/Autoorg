TypeScript

#!/usr/bin/env bun
import chalk from 'chalk';

async function main() {
  console.log(chalk.cyan('\n🔍 Checking approval health...\n'));

  const { getDb } = await import('../../src/db/migrate.js');
  const db = getDb();

  const stalePending = db.prepare(`
    SELECT COUNT(*) as n
    FROM pending_actions
    WHERE status = 'staged'
      AND created_at < datetime('now', '-7 days')
  `).get() as { n: number };

  const unapprovedDangerous = db.prepare(`
    SELECT COUNT(*) as n
    FROM action_ledger
    WHERE action_class IN ('EXECUTE', 'PUBLISH')
      AND status = 'applied'
      AND approval_id IS NULL
  `).get() as { n: number };

  const bypassAttempts = db.prepare(`
    SELECT COUNT(*) as n
    FROM security_findings
    WHERE category = 'approval_bypass_attempt'
      AND status = 'open'
  `).get() as { n: number };

  db.close();

  let hasIssue = false;

  if (stalePending.n > 0) {
    console.warn(chalk.yellow(`⚠️  ${stalePending.n} pending action(s) stale > 7 days`));
  }

  if (unapprovedDangerous.n > 0) {
    console.error(chalk.red(`❌ ${unapprovedDangerous.n} dangerous action(s) applied without approval`));
    hasIssue = true;
  }

  if (bypassAttempts.n > 0) {
    console.error(chalk.red(`❌ ${bypassAttempts.n} approval bypass attempt(s) on record`));
    hasIssue = true;
  }

  if (hasIssue) {
    process.exit(1);
  }

  console.log(chalk.green('✅ Approval health checks passed'));
}

main();