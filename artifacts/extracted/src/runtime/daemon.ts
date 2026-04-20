TypeScript

#!/usr/bin/env bun
import chalk from 'chalk';
import { ServiceState } from './service-state.js';
import { Scheduler } from './scheduler.js';
import { featureFlag, loadFeatureFlags } from '@/config/feature-flags.js';
import { memoryManager } from './memory-manager.js';

const state = new ServiceState();
const scheduler = new Scheduler();

async function runDueJobs() {
  const jobs = scheduler.dueJobs();
  for (const job of jobs) {
    try {
      scheduler.markRunning(job.id);

      switch (job.job_type) {
        case 'health_check':
          console.log(chalk.cyan(`[daemon] health_check job ${job.id}`));
          break;
        case 'dream':
          console.log(chalk.magenta(`[daemon] dream job ${job.id}`));
          break;
        case 'graph_rebuild':
          console.log(chalk.green(`[daemon] graph rebuild job ${job.id}`));
          break;
        case 'github_sync':
          console.log(chalk.yellow(`[daemon] github sync job ${job.id}`));
          break;
        case 'org_run':
          console.log(chalk.blue(`[daemon] org run job ${job.id}`));
          break;
      }

      scheduler.markDone(job.id, job.cron_expr);
    } catch (err) {
      scheduler.markError(job.id, String(err), job.cron_expr);
    }
  }
}

async function main() {
  await loadFeatureFlags();

  if (!featureFlag('daemonMode')) {
    console.log(chalk.yellow('daemonMode feature flag disabled.'));
    process.exit(0);
  }

  state.start(process.pid);

  console.log(chalk.bold.cyan('\n🤖 AutoOrg Daemon started'));
  console.log(chalk.gray('Press Ctrl+C to stop.\n'));

  const interval = setInterval(async () => {
    try {
      state.heartbeat();
      if (featureFlag('scheduler')) {
        await runDueJobs();
      }
    } catch (err) {
      state.error(String(err));
    }
  }, 10_000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    state.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(interval);
    state.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  state.error(String(err));
  process.exit(1);
});
10. GitHub integration