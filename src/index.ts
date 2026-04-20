#!/usr/bin/env bun
/**
 * AutoOrg — Main Entry Point
 * 
 * Usage:
 *   bun start                        # uses org.md in current directory
 *   bun start --org path/to/org.md   # custom org file
 *   bun start --no-ui                # headless mode (logs only)
 *   bun start --mock                 # Phase 0 mock mode (no API calls)
 */

import React from 'react';
import { render } from 'ink';
import { config as dotenvConfig } from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenvConfig();

// Parse CLI arguments
const args = process.argv.slice(2);
const orgMdPath  = args.includes('--org') ? args[args.indexOf('--org') + 1] : 'org.md';
const noUi       = args.includes('--no-ui') || args.includes('--headless');
const mockMode   = args.includes('--mock') || args.includes('--phase0');
const helpFlag   = args.includes('--help') || args.includes('-h');

if (helpFlag) {
  console.log(`
${chalk.bold.cyan('AutoOrg — Autonomous Research Organization Engine')}
${chalk.gray('"You write the mission. The agents run the company."')}

${chalk.bold('Usage:')}
  bun start [options]

${chalk.bold('Options:')}
  --org <path>    Path to org.md file (default: ./org.md)
  --no-ui         Run in headless mode without terminal UI
  --mock          Phase 0 mock mode — no LLM API calls
  --help          Show this help message

${chalk.bold('Examples:')}
  bun start                              # Full run with UI
  bun start --mock                       # Test the loop without API costs
  bun start --org ./my-research/org.md   # Custom org file
  bun start --no-ui --mock               # Headless mock run (CI/testing)

${chalk.bold('First time?')}
  bun run init      # Initialize project structure
  bun run db:migrate # Set up database
  # Edit org.md with your mission
  bun start --mock  # Test the loop
  bun start         # Real run

${chalk.bold('Providers supported:')}
  anthropic, openai, ollama (local), groq, together, lmstudio, custom

${chalk.bold('Keyboard shortcuts (UI mode):')}
  Q or Ctrl+C     Gracefully stop the loop
`);
  process.exit(0);
}

// ── Check prerequisites ────────────────────────────────────────────────
import { existsSync } from 'node:fs';
import path from 'node:path';

if (!existsSync(orgMdPath)) {
  console.error(chalk.red(`\n✗ org.md not found at: ${orgMdPath}`));
  console.error(chalk.yellow(`  Run \`bun run init\` to create the default files.`));
  process.exit(1);
}

if (!existsSync('./autoorg.db')) {
  console.error(chalk.red('\n✗ Database not found.'));
  console.error(chalk.yellow('  Run `bun run db:migrate` first.'));
  process.exit(1);
}

// ── Run the orchestrator ───────────────────────────────────────────────
import { orchestratorLoop } from './runtime/orchestrator.js';
import { parseOrgMd } from './config/org-parser.js';
import { Dashboard } from './ui/terminal/Dashboard.js';

async function main() {
  const config = parseOrgMd(orgMdPath);
  
  // Create the event generator
  const events = orchestratorLoop(orgMdPath, {
    mockAgents:  mockMode || true,  // Phase 0: always mock agents
    mockScoring: mockMode || true,  // Phase 0: always mock scoring
  });
  
  if (noUi) {
    // ── HEADLESS MODE ──────────────────────────────────────────────
    console.log(chalk.cyan('Running in headless mode...'));
    for await (const event of events) {
      if (process.env.AUTOORG_LOG_LEVEL === 'debug') {
        console.log(JSON.stringify(event));
      }
      if (event.type === 'run_complete') {
        console.log(chalk.green(`\nDone. Best score: ${event.finalBest}`));
        process.exit(0);
      }
      if (event.type === 'error' && event.fatal) {
        console.error(chalk.red(`Fatal: ${event.message}`));
        process.exit(1);
      }
    }
  } else {
    // ── FULL UI MODE ───────────────────────────────────────────────
    const { unmount } = render(
      React.createElement(Dashboard, {
        events,
        runId: `run_${Date.now()}`,
        maxCycles: config.maxCycles,
        budget: config.maxApiSpendUsd,
      })
    );
    
    // Cleanup on exit
    process.on('SIGINT', () => {
      unmount();
      process.exit(0);
    });
  }
}

main().catch(err => {
  console.error(chalk.red('\n✗ Fatal error:'), err);
  process.exit(1);
});
