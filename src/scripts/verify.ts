#!/usr/bin/env bun
/**
 * AutoOrg Pre-flight Verification
 * Run this before your first real (non-mock) run.
 * bun run src/scripts/verify.ts
 */

import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

interface Check {
  name: string;
  check: () => Promise<boolean | string>;
  required: boolean;
}

const checks: Check[] = [
  {
    name: 'org.md exists',
    check: async () => existsSync('./org.md'),
    required: true,
  },
  {
    name: 'constitution.md exists',
    check: async () => existsSync('./constitution.md'),
    required: true,
  },
  {
    name: 'Database exists',
    check: async () => existsSync('./autoorg.db'),
    required: true,
  },
  {
    name: 'memory/MEMORY.md exists',
    check: async () => existsSync('./memory/MEMORY.md'),
    required: true,
  },
  {
    name: 'workspace/current_output.md exists',
    check: async () => existsSync('./workspace/current_output.md'),
    required: true,
  },
  {
    name: 'Anthropic API key configured',
    check: async () => {
      if (!process.env.ANTHROPIC_API_KEY) return 'Not set (optional if using Ollama)';
      return process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
    },
    required: false,
  },
  {
    name: 'OpenAI API key configured',
    check: async () => {
      if (!process.env.OPENAI_API_KEY) return 'Not set (optional)';
      return process.env.OPENAI_API_KEY.startsWith('sk-');
    },
    required: false,
  },
  {
    name: 'Ollama running',
    check: async () => {
      try {
        const r = await fetch(
          (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434') + '/api/tags',
          { signal: AbortSignal.timeout(2000) }
        );
        if (!r.ok) return false;
        const data = await r.json() as { models?: { name: string }[] };
        const models = data.models?.map(m => m.name) ?? [];
        return models.length > 0 
          ? `Running — ${models.length} models: ${models.slice(0, 3).join(', ')}`
          : 'Running but no models installed';
      } catch {
        return 'Not running (optional — only needed for local models)';
      }
    },
    required: false,
  },
  {
    name: 'Git initialized',
    check: async () => existsSync('./.git'),
    required: true,
  },
  {
    name: 'org.md has MISSION section',
    check: async () => {
      try {
        const { parseOrgMd } = await import('../config/org-parser.js');
        const config = parseOrgMd('./org.md');
        if (config.mission.includes('[REPLACE THIS')) {
          return 'Mission still has placeholder text — please edit org.md';
        }
        return config.mission.length > 20;
      } catch (e) {
        return `Parse error: ${e}`;
      }
    },
    required: true,
  },
];

async function verify() {
  console.log(chalk.bold.cyan('\n🔍 AutoOrg Pre-flight Check\n'));
  
  let allRequired = true;
  
  for (const check of checks) {
    const result = await check.check();
    const passed = result === true || (typeof result === 'string' && !result.startsWith('Parse error'));
    const isError = result === false;
    
    if (isError && check.required) allRequired = false;
    
    const icon = isError ? '✗' : '✓';
    const color = isError ? (check.required ? 'red' : 'yellow') : 'green';
    const suffix = typeof result === 'string' ? chalk.gray(` (${result})`) : '';
    
    console.log(
      chalk[color](`  ${icon} ${check.name}`) + suffix
    );
  }
  
  console.log();
  
  if (allRequired) {
    console.log(chalk.bold.green('✅ All required checks passed. Ready to run!\n'));
    console.log(chalk.white('  bun start --mock     # Test with mock agents first'));
    console.log(chalk.white('  bun start            # Real run\n'));
  } else {
    console.log(chalk.bold.red('✗ Some required checks failed. Fix errors above first.\n'));
    process.exit(1);
  }
}

verify().catch(console.error);
