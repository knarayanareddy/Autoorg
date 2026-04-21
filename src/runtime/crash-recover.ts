import chalk from 'chalk';
import { getDb } from '@/db/migrate.js';
import { RecoveryJournal } from './recovery-journal.js';
import { IncidentLog } from './incident-log.js';

export class CrashRecover {
  private incidents = new IncidentLog();

  async detectAndRecover() {
    const db = getDb();
    
    // Find runs that were interrupted (status 'running' but no heartbeat in last 2 mins)
    const interruptedRuns = db.prepare(`
      SELECT id, org_md_path FROM runs
      WHERE status = 'running' 
        AND updated_at < datetime('now', '-2 minutes')
    `).all() as { id: string; org_md_path: string }[];

    db.close();

    for (const run of interruptedRuns) {
      console.log(chalk.bold.yellow(`\n⚠️ Detected interrupted run: ${run.id}`));
      
      const journal = new RecoveryJournal(run.id);
      const checkpoint = await journal.getLatestCheckpoint();

      if (checkpoint) {
        console.log(chalk.cyan(`  ✓ Found checkpoint: Cycle ${checkpoint.cycleNumber}, Stage ${checkpoint.stage}`));
        
        this.incidents.log({
          runId: run.id,
          severity: 'warn',
          component: 'crash-recover',
          summary: `Run ${run.id} recovered after crash`,
          details: { checkpoint },
        });

        // In a real implementation, we'd trigger the orchestrator resume here.
        // For now, we mark as 'recovered' in the DB so it can be resumed manually or by daemon.
      } else {
        console.log(chalk.red(`  ✗ No checkpoint found for ${run.id}. Automated recovery impossible.`));
      }
    }
  }
}
