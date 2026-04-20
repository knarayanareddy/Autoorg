#!/usr/bin/env bun
import chalk from 'chalk';

const API_URL = process.env.AUTOORG_API_URL ?? 'http://localhost:3000';

async function main() {
  console.log(chalk.cyan(`\n🔍 Probing health of ${API_URL}/health...\n`));
  try {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json().catch(() => ({}));

    if (res.status !== 200) {
      console.error(chalk.red(`  ❌ Health check failed: HTTP ${res.status}`));
      process.exit(1);
    }

    console.log(chalk.green('  ✅ Health check passed: 200 OK'));
    console.log(chalk.gray(JSON.stringify(data, null, 2)));
  } catch (e) {
    console.error(chalk.red(`  ❌ Health check error: ${e}`));
    process.exit(1);
  }
}

main();
