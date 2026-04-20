#!/usr/bin/env bun
import chalk from 'chalk';

async function main() {
  console.log(chalk.cyan('\n🔍 Auditing approval health and ledger records...\n'));

  const { getDb } = await import('../../src/db/migrate.js');
  const db = getDb();

  // Check for dangerous actions applied without a corresponding approval id
  const unapprovedDangerous = db.prepare(`
    SELECT COUNT(*) as n
    FROM action_ledger
    WHERE action_class IN ('EXECUTE', 'PUBLISH')
      AND status = 'applied'
      AND approval_id IS NULL
  `).get() as { n: number };

  // Check for bypass attempts logged in security findings
  const bypassAttempts = db.prepare(`
    SELECT COUNT(*) as n
    FROM security_findings
    WHERE category = 'approval_bypass_attempt'
      AND status = 'open'
  `).get() as { n: number };

  db.close();

  let hasIssue = false;

  if (unapprovedDangerous.n > 0) {
    console.error(chalk.red(`  ❌ ${unapprovedDangerous.n} dangerous action(s) applied without approval ID.`));
    hasIssue = true;
  }

  if (bypassAttempts.n > 0) {
    console.error(chalk.red(`  ❌ ${bypassAttempts.n} approval bypass attempt(s) detected.`));
    hasIssue = true;
  }

  if (hasIssue) {
    process.exit(1);
  }

  console.log(chalk.bold.green('✅ Approval health checks passed.\n'));
}

main();
