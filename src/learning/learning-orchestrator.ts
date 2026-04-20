import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { PatternMiner } from './pattern-miner.js';
import { PromptOptimizer } from './prompt-optimizer.js';
import { Simulator } from './simulator.ts';
import { ReleaseGate } from './release-gate.js';

export class LearningOrchestrator {
  private miner = new PatternMiner();
  private optimizer = new PromptOptimizer();
  private simulator = new Simulator();
  private gate = new ReleaseGate();

  async runCycle(opts: { tenantId?: string; workspaceId?: string }) {
    const cycleId = `lc_${nanoid(10)}`;
    const db = getDb();
    
    // 1. Initialize Cycle
    db.prepare(`
      INSERT INTO learning_cycles (id, tenant_id, workspace_id, status)
      VALUES (?, ?, ?, 'running')
    `).run(cycleId, opts.tenantId || 'ten_default', opts.workspaceId || 'ws_default');
    db.close();

    console.log(`[Learning] Starting cycle ${cycleId}...`);

    try {
      // 2. Mine Patterns
      const { report } = await this.miner.mine({ learningCycleId: cycleId });
      console.log(`[Learning] Mined ${report.recommended_optimizations.length} potential optimizations.`);

      // 3. Process first optimization (for this demo/simplified loop)
      const target = report.recommended_optimizations[0];
      if (target) {
        console.log(`[Learning] Optimizing ${target.target}...`);
        const { proposalId, versionId } = await this.optimizer.optimize({
          learningCycleId: cycleId,
          targetKey: target.target,
          patterns: report
        });

        // 4. Simulate
        console.log(`[Learning] Simulating proposal ${proposalId}...`);
        const simResult = await this.simulator.simulate({ proposalId, versionId });

        // 5. Pass through Release Gate
        const finalStatus = await this.gate.processSimulation(proposalId, simResult);
        console.log(`[Learning] Cycle result: ${finalStatus.status}`);
      }

      const db2 = getDb();
      db2.prepare(`UPDATE learning_cycles SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cycleId);
      db2.close();

      return { success: true, cycleId };
    } catch (error) {
      console.error(`[Learning] Cycle ${cycleId} failed:`, error);
      const db3 = getDb();
      db3.prepare(`UPDATE learning_cycles SET status = 'failed', finished_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cycleId);
      db3.close();
      throw error;
    }
  }
}
