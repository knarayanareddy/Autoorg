TypeScript

import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';

export class MemoryPruner {
  private artifacts = new ImmutableArtifacts();

  async prune(opts?: {
    workspaceRoot?: string;
    utilityThreshold?: number;
    keepRecent?: number;
  }) {
    const root = opts?.workspaceRoot ?? process.cwd();
    const threshold = opts?.utilityThreshold ?? 0.20;
    const db = getDb();

    const rows = db.prepare(`
      SELECT *
      FROM memory_utility_scores
      WHERE utility_score < ? AND keep_recommendation = 0
      ORDER BY utility_score ASC
    `).all(threshold) as Array<any>;

    const archived: string[] = [];
    const archiveDir = path.join(root, 'memory', 'archive');
    await mkdir(archiveDir, { recursive: true });

    for (const row of rows) {
      const src = row.memory_path;
      const target = path.join(archiveDir, path.basename(src));
      await rename(src, target).catch(() => {});
      archived.push(target);
    }

    const written = await this.artifacts.writeJson({
      runId: 'learning_memory_prune',
      relPath: `artifacts/learning/memory/prune_${Date.now()}.json`,
      data: {
        archived,
        threshold,
      },
      artifactKind: 'memory_prune_report',
    });

    db.close();
    return {
      archivedCount: archived.length,
      artifactPath: written.artifactPath,
    };
  }
}
12. Routing optimizer prompt + runtime