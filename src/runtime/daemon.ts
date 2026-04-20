#!/usr/bin/env bun
import chalk from 'chalk';
import { ServiceState } from './service-state.js';
import { Scheduler } from './scheduler.js';
import { featureFlag, loadFeatureFlags } from '@/config/feature-flags.js';

const state = new ServiceState();
const scheduler = new Scheduler();

async function runDueJobs() {
  const jobs = scheduler.dueJobs();
  for (const job of jobs) {
    try {
      scheduler.markRunning(job.id);
      console.log(chalk.cyan(`[daemon] Running job ${job.job_type} (${job.id})`));

      switch (job.job_type) {
        case 'health_check':
          // Placeholder for real health check logic
          console.log(chalk.gray(`[daemon] System health check passed.`));
          break;
        case 'dream':
          console.log(chalk.magenta(`[daemon] Triggering automated dream cycle...`));
          // In a real implementation, we'd spawn the DreamEngine here
          break;
        case 'graph_rebuild':
          console.log(chalk.green(`[daemon] Rebuilding knowledge graph from facts...`));
          break;
        case 'github_sync':
          console.log(chalk.yellow(`[daemon] Syncing with GitHub Issues/PRs...`));
          break;
        case 'org_run':
          console.log(chalk.blue(`[daemon] Starting scheduled organization mission run...`));
          break;
      }

      scheduler.markDone(job.id, job.cron_expr);
    } catch (err) {
      console.error(chalk.red(`[daemon] Job ${job.id} failed:`), err);
      scheduler.markError(job.id, String(err), job.cron_expr);
    }
  }
}

async function main() {
  await loadFeatureFlags();

  if (!featureFlag('daemonMode')) {
    console.log(chalk.yellow('daemonMode feature flag is disabled. Exiting.'));
    process.exit(0);
  }

  state.start(process.pid);

  console.log(chalk.bold.cyan('\n🤖 AutoOrg Daemon started'));
  console.log(chalk.gray(`PID: ${process.pid}`));
  console.log(chalk.gray('Press Ctrl+C to stop.\n'));

  // Heartbeat every 10 seconds
  const interval = setInterval(async () => {
    try {
      state.heartbeat();
      if (featureFlag('scheduler')) {
        await runDueJobs();
      }
    } catch (err) {
      console.error(chalk.red('[daemon] Critical failure in main loop:'), err);
      state.error(String(err));
    }
  }, 10_000);

  // Clean exit handlers
  const cleanup = () => {
    console.log(chalk.yellow('\nStopping daemon...'));
    clearInterval(interval);
    state.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error(chalk.red('[daemon] Daemon crashed:'), err);
  state.error(String(err));
  process.exit(1);
});
