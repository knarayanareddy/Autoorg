TypeScript

#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { getDb } from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n⚙️ Running Phase 5.1 migrations...\n'));
  const db = getDb();
  const schema = readFileSync(path.join(import.meta.dir, 'schema-phase5_1.sql'), 'utf-8');
  db.exec(schema);
  db.close();
  console.log(chalk.bold.green('✅ Phase 5.1 migration complete.\n'));
}

migrate().catch(console.error);
Run:

Bash

bun run src/db/migrate-phase5_1.ts
2. Ratchet hardening: split decision from materialization
Patch src/runtime/ratchet.ts
TypeScript

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const sh = promisify(exec);

export type RatchetDecision = 'COMMIT' | 'REVERT' | 'PENDING_APPROVAL';

export class RatchetEngine {
  constructor(private constitution: Constitution) {}

  async score(proposal: Proposal, graph: KnowledgeGraph): Promise<RatchetScore> {
    const judgeOutput = await AgentRunner.run('RatchetJudge', {
      proposal,
      constitution: this.constitution,
      graph,
      model: 'claude-opus-4',
    });
    return judgeOutput as RatchetScore;
  }

  decide(score: RatchetScore, bestScore: number): 'COMMIT' | 'REVERT' {
    return score.composite > bestScore ? 'COMMIT' : 'REVERT';
  }

  async materializeCommit(opts: {
    file?: string;
    commitMessage: string;
  }): Promise<string> {
    const file = opts.file ?? 'workspace/current_output.md';
    await sh(`git add ${file}`);
    await sh(`git commit -m "${opts.commitMessage.replace(/"/g, '\\"')}"`);
    const { stdout } = await sh('git rev-parse HEAD');
    return stdout.trim();
  }

  async materializeRevert(file = 'workspace/current_output.md'): Promise<void> {
    await sh(`git checkout -- ${file}`);
  }
}
Key change: the ratchet still decides truthfully, but git side effects are now performed by either the orchestrator or the approval enforcer.

3. Strict approval blocking