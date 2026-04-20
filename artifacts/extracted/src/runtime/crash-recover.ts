TypeScript

import { RecoveryJournal } from '@/runtime/recovery-journal.js';
import { LeaseManager } from '@/runtime/lease-manager.js';
import { WorkspaceLock } from '@/runtime/workspace-lock.js';
import { IncidentLog } from '@/runtime/incident-log.js';

export async function recoverInterruptedRun(runId: string) {
  const journal = new RecoveryJournal(runId);
  const leases = new LeaseManager(runId);
  const locks = new WorkspaceLock();
  const incidents = new IncidentLog();

  const checkpoint = journal.latest();
  if (!checkpoint) return null;

  journal.recordEvent('resume_started', `Attempting recovery for run ${runId}`, checkpoint);

  try {
    locks.sweepExpired();
    leases.reclaimExpired();
    journal.recordEvent('resume_succeeded', `Recovered run ${runId}`, {
      resumeFromStage: checkpoint.stage,
      cycleNumber: checkpoint.cycleNumber,
    });
    return checkpoint;
  } catch (error) {
    journal.recordEvent('resume_failed', `Recovery failed for run ${runId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    incidents.log({
      runId,
      severity: 'error',
      component: 'crash-recover',
      summary: `Run recovery failed`,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}
6. Worker leases + heartbeat reclaim