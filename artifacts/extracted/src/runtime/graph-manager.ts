TypeScript

import chalk from 'chalk';
import { featureFlag } from '@/config/feature-flags.js';
import type { OrgConfig } from '@/types/index.js';
import { buildGraphFromSeed, updateGraphFromFacts } from '@/graph/build.js';
import type { Fact } from '@/memory/fact-store.js';

export class GraphManager {
  private runId = '';
  private built = false;

  init(runId: string) {
    this.runId = runId;
    this.built = false;
  }

  async ensureBuilt(config: OrgConfig): Promise<void> {
    if (!featureFlag('graphRag')) return;
    if (this.built) return;

    await buildGraphFromSeed(this.runId, config);
    this.built = true;
  }

  async updateFromFacts(cycleNumber: number, facts: Fact[]): Promise<void> {
    if (!featureFlag('graphIncrementalUpdate')) return;
    if (!this.built) return;
    if (facts.length === 0) return;

    const result = await updateGraphFromFacts(this.runId, cycleNumber, facts);
    console.log(chalk.cyan(
      `  🕸 Graph dream update: +${result.nodes} nodes, +${result.edges} edges (${result.ms}ms)`
    ));
  }
}

export const graphManager = new GraphManager();
6. Replace src/runtime/grounded-context.ts
This version includes stronger citation rules and per-role query helpers.
