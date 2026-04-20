#!/usr/bin/env bun
import chalk from 'chalk';

const args = process.argv.slice(2);
const preDeployMode = args.includes('--pre-deploy');
const artifactsOnly = args.includes('--artifacts-only');

async function main() {
  console.log(chalk.cyan('\n🔒 Running enterprise security scan...\n'));

  const { getDb } = await import('../../src/db/migrate.js');
  const db = getDb();

  // Check for open security findings
  const findings = db.prepare(`
    SELECT severity, category, summary, created_at
    FROM security_findings
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as Array<any>;

  const critical = findings.filter(f => f.severity === 'critical');
  const errors = findings.filter(f => f.severity === 'error');

  console.log(`  Open security findings: ${findings.length}`);
  console.log(`    Critical: ${critical.length}`);
  console.log(`    Error:    ${errors.length}`);

  if (preDeployMode && critical.length > 0) {
    console.error(chalk.red('\n  ❌ DEPLOYMENT BLOCKED: Critical security findings exist.'));
    db.close();
    process.exit(1);
  }

  if (!artifactsOnly) {
    const redactions = db.prepare(`
      SELECT COUNT(*) as n FROM redaction_events
    `).get() as { n: number };
    console.log(`  Total redaction events: ${redactions.n}`);
  }

  db.close();
  console.log(chalk.bold.green('\n✅ Security scan passed.\n'));
}

main();
