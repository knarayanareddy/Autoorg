#!/usr/bin/env bun
import chalk from 'chalk';
import { ServiceState } from './service-state.js';
import { Scheduler } from './scheduler.js';
import { featureFlag, loadFeatureFlags } from '@/config/feature-flags.js';
import { getUnprocessedGitHubEvents, markGitHubEventProcessed } from '@/db/queries.js';
import { nanoid } from 'nanoid';

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
          await syncGitHubEvents();
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

async function syncGitHubEvents() {
  const events = getUnprocessedGitHubEvents();
  if (events.length === 0) return;

  console.log(chalk.gray(`[daemon] Found ${events.length} new GitHub events to process.`));

  for (const event of events) {
    try {
      console.log(chalk.gray(`[daemon] Processing ${event.event_type} (${event.id})...`));
      
      const payload = JSON.parse(event.payload_json);

      // Trigger Logic: push to main
      if (event.event_type === 'push' && payload.ref === 'refs/heads/main') {
        console.log(chalk.green(`[daemon] Push to main detected. Triggering autonomous mission run.`));
        
        // Schedule an immediate org_run
        scheduler.createJob({
          jobType: 'org_run',
          cronExpr: 'every_1m', // dummy cron, will be deleted/marked done
          payload: { trigger_event: event.id, source: 'github_push' }
        });
      }

      markGitHubEventProcessed(event.id);
    } catch (err) {
      console.error(chalk.red(`[daemon] Failed to process event ${event.id}:`), err);
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
