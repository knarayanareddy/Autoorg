#!/usr/bin/env bun
import chalk from 'chalk';

const API_URL = process.env.AUTOORG_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.AUTOORG_API_KEY ?? '';
const PRODUCTION = process.argv.includes('--production');

async function get(path: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
    },
  });
  return res;
}

async function main() {
  console.log(chalk.cyan(`\n🔬 Smoke tests against ${API_URL}...\n`));
  const failures: string[] = [];

  const checks = [
    { path: '/health', label: 'Health endpoint', expectedStatus: 200 },
    { path: '/api/runs', label: 'Runs API', expectedStatus: 200 },
    { path: '/api/flags', label: 'Feature Flags', expectedStatus: 200 },
  ];

  if (!PRODUCTION) {
    checks.push(
      { path: '/api/learning/proposals', label: 'Learning proposals', expectedStatus: 200 },
    );
  }

  for (const check of checks) {
    try {
      const res = await get(check.path);
      if (res.status !== check.expectedStatus) {
        failures.push(`${check.label}: expected ${check.expectedStatus}, got ${res.status}`);
        console.error(chalk.red(`  ❌ ${check.label}: ${res.status}`));
      } else {
        console.log(chalk.green(`  ✅ ${check.label}: ${res.status}`));
      }
    } catch (e) {
      failures.push(`${check.label}: network error`);
      console.error(chalk.red(`  ❌ ${check.label}: network error`));
    }
  }

  if (failures.length > 0) {
    console.error(chalk.red(`\n${failures.length} smoke test(s) failed`));
    process.exit(1);
  }

  console.log(chalk.bold.green('\n✅ All smoke tests passed.\n'));
}

main();
