TypeScript

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class TeamMemoryPartitions {
  constructor(private runId: string) {}

  async ensureTeamPartition(teamId: string, partitionName: string) {
    const base = path.join(process.cwd(), 'memory', 'partitions', teamId);
    const factsDir = path.join(base, 'facts');
    const memoryIndex = path.join(base, 'MEMORY.md');

    await mkdir(factsDir, { recursive: true });
    try {
      await readFile(memoryIndex, 'utf-8');
    } catch {
      await writeFile(memoryIndex, `# ${partitionName} Memory\n\n`, 'utf-8');
    }

    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO memory_partitions
      (id, run_id, team_id, partition_name, index_path, facts_dir, read_scope_json, write_scope_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `mp_${nanoid(8)}`,
      this.runId,
      teamId,
      partitionName,
      memoryIndex,
      factsDir,
      JSON.stringify(['shared', teamId]),
      JSON.stringify([teamId])
    );
    db.close();

    return { base, factsDir, memoryIndex };
  }

  async buildContext(teamId?: string) {
    const sharedPath = path.join(process.cwd(), 'memory', 'MEMORY.md');
    const shared = await readFile(sharedPath, 'utf-8').catch(() => '');

    if (!teamId) return shared;

    const teamPath = path.join(process.cwd(), 'memory', 'partitions', teamId, 'MEMORY.md');
    const team = await readFile(teamPath, 'utf-8').catch(() => '');

    return [
      '## SHARED MEMORY',
      shared.slice(0, 2000),
      '',
      `## TEAM PARTITION (${teamId})`,
      team.slice(0, 1500),
    ].join('\n');
  }

  async appendFact(teamId: string, fileName: string, content: string) {
    const target = path.join(process.cwd(), 'memory', 'partitions', teamId, 'facts', fileName);
    const previous = await readFile(target, 'utf-8').catch(() => '');
    await writeFile(target, previous + '\n' + content.trim() + '\n', 'utf-8');
  }
}
11. GitHub issue → org task translation