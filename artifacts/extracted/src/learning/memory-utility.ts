TypeScript

import { createHash } from 'node:crypto';
import { Glob } from 'bun';
import { readFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { MEMORY_UTILITY_SYSTEM_PROMPT, MemoryUtilitySchema } from '@/prompts/memory-utility.js';

function sha(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export class MemoryUtilityScorer {
  async scoreWorkspace(workspaceRoot = process.cwd()) {
    const glob = new Glob('memory/**/*.{md,txt,json}');
    const db = getDb();
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const scored = [];

    for await (const file of glob.scan(workspaceRoot)) {
      const fullPath = `${workspaceRoot}/${file}`;
      const text = await readFile(fullPath, 'utf-8').catch(() => '');
      if (!text.trim()) continue;

      const accessRow = db.prepare(`
        SELECT COUNT(*) as n
        FROM tool_artifacts
        WHERE source_uri = ?
      `).get(fullPath) as { n: number };

      const citationRow = db.prepare(`
        SELECT COUNT(*) as n
        FROM evidence_items
        WHERE source_uri = ?
      `).get(fullPath) as { n: number };

      const benchRow = db.prepare(`
        SELECT COALESCE(AVG(gold_match), 0) as avg_gold
        FROM benchmark_metrics
      `).get() as { avg_gold: number };

      const out = await adapter.structured({
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: MEMORY_UTILITY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              path: fullPath,
              preview: text.slice(0, 3000),
              accessCount: accessRow.n,
              citationCount: citationRow.n,
              benchmarkContribution: benchRow.avg_gold,
            }, null, 2),
          },
        ],
        schema: MemoryUtilitySchema,
      });

      db.prepare(`
        INSERT INTO memory_utility_scores
        (id, workspace_id, memory_path, item_hash, access_count, citation_count, benchmark_contribution,
         recency_score, utility_score, keep_recommendation, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mus_${nanoid(10)}`,
        null,
        fullPath,
        sha(text),
        accessRow.n,
        citationRow.n,
        benchRow.avg_gold,
        0.5,
        out.utility_score,
        out.keep_recommendation ? 1 : 0,
        JSON.stringify({ rationale: out.rationale })
      );

      scored.push({
        path: fullPath,
        utilityScore: out.utility_score,
        keep: out.keep_recommendation,
      });
    }

    db.close();
    return scored;
  }
}