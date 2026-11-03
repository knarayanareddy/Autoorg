#!/usr/bin/env bun
/**
 * Security scan gate.
 *
 * Two things were wrong before: it only counted rows already sitting in
 * `security_findings` (so it could never find anything on its own and always
 * printed "✅ Security scan passed"), and it never inspected the source tree.
 *
 * This version adds real, dependency-free static checks for the things that
 * have actually bitten this repo: committed secrets, committed databases or
 * build output, and unauthenticated mutating routes.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'glob';

const args = process.argv.slice(2);
const preDeployMode = args.includes('--pre-deploy');

interface Problem {
  severity: 'critical' | 'error' | 'warn';
  summary: string;
  detail: string;
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI key', re: /sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Slack token', re: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
];

/** Files that legitimately contain token-shaped examples. */
const ALLOWLIST = new Set([
  '.env.example',
  'src/runtime/redaction.ts',
  'src/api/auth.ts',
  'tests/redaction.test.ts',
  'tests/api-auth.test.ts',
  'tests/git-hooks.test.ts', // seeds a fake key to prove the pre-commit hook catches it
  'scripts/ci/security-scan.ts',
]);

function scanSecrets(files: string[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    if (ALLOWLIST.has(file)) continue;
    if (file.startsWith('artifacts/') || file.startsWith('~')) continue;
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const { name, re } of SECRET_PATTERNS) {
      const match = content.match(re);
      if (match) {
        problems.push({
          severity: 'critical',
          summary: `Possible ${name} committed`,
          detail: `${file}: ${match[0].slice(0, 12)}…`,
        });
      }
    }
  }
  return problems;
}

function scanTrackedArtifacts(): Problem[] {
  const problems: Problem[] = [];
  const raw = Bun.spawnSync(['git', 'ls-files']);
  if (raw.exitCode !== 0) return problems;

  const tracked = raw.stdout.toString().split('\n').filter(Boolean);
  const offenders = tracked.filter(f =>
    /\.db(-shm|-wal)?$/.test(f) || f.startsWith('web/.next/') || f.startsWith('~/')
  );

  if (offenders.length > 0) {
    problems.push({
      severity: 'error',
      summary: `${offenders.length} generated file(s) are tracked in git`,
      detail: offenders.slice(0, 5).join(', ') + (offenders.length > 5 ? ', …' : ''),
    });
  }
  return problems;
}

/** Guard the regression this repo just fixed: unauthenticated POST routes. */
function scanRouteAuth(): Problem[] {
  const problems: Problem[] = [];
  const server = 'src/api/server.ts';
  if (!existsSync(server)) return problems;

  const src = readFileSync(server, 'utf-8');
  if (!/authenticate\(req,\s*true\)/.test(src)) {
    problems.push({
      severity: 'critical',
      summary: 'API server does not gate mutating requests',
      detail: `${server}: expected an authenticate(req, true) check for POST routes`,
    });
  }
  if (/Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/.test(src)) {
    problems.push({
      severity: 'critical',
      summary: 'Wildcard CORS on the API server',
      detail: `${server}: use the AUTOORG_CORS_ORIGINS allowlist instead`,
    });
  }
  return problems;
}

function scanDbFindings(): Problem[] {
  // Best-effort: report open findings already recorded at runtime.
  const problems: Problem[] = [];
  try {
    const dbPath = process.env.AUTOORG_DB_PATH || process.env.DB_PATH || './autoorg.db';
    if (!existsSync(dbPath)) return problems;
    const { Database } = require('bun:sqlite') as typeof import('bun:sqlite');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(
      `SELECT severity, summary FROM security_findings WHERE status = 'open' LIMIT 50`
    ).all() as Array<{ severity: string; summary: string }>;
    db.close();

    for (const row of rows) {
      if (row.severity === 'critical') {
        problems.push({
          severity: 'critical',
          summary: `Open runtime finding: ${row.summary}`,
          detail: `recorded in ${dbPath}`,
        });
      }
    }
  } catch {
    // No database or no table yet — the static checks above still run.
  }
  return problems;
}

async function main() {
  console.log(chalk.cyan('\n🔒 Running security scan...\n'));

  const sourceFiles = globSync([
    'src/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts',
    'web/**/*.ts', 'web/**/*.tsx',
    '*.ts', '*.json', '*.toml', '*.md', '.env*',
  ], { ignore: ['**/node_modules/**', 'web/.next/**'] });

  const problems = [
    ...scanSecrets(sourceFiles),
    ...scanTrackedArtifacts(),
    ...scanRouteAuth(),
    ...scanDbFindings(),
  ];

  const critical = problems.filter(p => p.severity === 'critical');
  const errors = problems.filter(p => p.severity === 'error');
  const warns = problems.filter(p => p.severity === 'warn');

  console.log(`  Files scanned: ${sourceFiles.length}`);
  console.log(`  Critical: ${critical.length}  Error: ${errors.length}  Warn: ${warns.length}\n`);

  for (const p of problems) {
    const color = p.severity === 'critical' ? chalk.red : p.severity === 'error' ? chalk.yellow : chalk.gray;
    console.log(color(`  [${p.severity}] ${p.summary}`));
    console.log(chalk.gray(`           ${p.detail}`));
  }

  const blocking = critical.length + errors.length;
  if (blocking > 0 && (preDeployMode || problems.length > 0)) {
    console.error(chalk.red(`\n❌ Security scan failed (${blocking} blocking issue(s)).\n`));
    process.exit(1);
  }

  console.log(chalk.bold.green('\n✅ Security scan passed.\n'));
}

main();
