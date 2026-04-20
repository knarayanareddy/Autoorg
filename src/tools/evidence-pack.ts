import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import type { ToolResult } from './registry.js';

export interface EvidenceItem {
  executionId: string;
  claimText?: string;
  sourceUri?: string;
  title?: string;
  excerpt: string;
  confidence: number;
}

export class EvidencePack {
  private items: EvidenceItem[] = [];

  constructor(
    private runId: string,
    private cycleNumber: number,
    private role: string,
    private teamId?: string,
    private taskId?: string
  ) {}

  addFromToolResult(executionId: string, result: ToolResult) {
    if (!result.sources) return;

    for (const src of result.sources) {
      this.items.push({
        executionId,
        sourceUri: src.uri,
        title: src.title,
        excerpt: src.excerpt ?? result.summary,
        confidence: (src.metadata?.score as number) ?? 0.8,
      });
    }
  }

  save(): string {
    const packId = `ep_${nanoid(8)}`;
    const db = getDb();
    
    db.prepare(`
      INSERT INTO evidence_packs (id, run_id, cycle_number, task_id, team_id, owner_role, kind, summary, artifact_path, item_count)
      VALUES (?, ?, ?, ?, ?, ?, 'worker', ?, 'db://internal', ?)
    `).run(packId, this.runId, this.cycleNumber, this.taskId ?? null, this.teamId ?? null, this.role, `Evidence gathered for ${this.role} task`, this.items.length);

    const stmt = db.prepare(`
      INSERT INTO evidence_items (id, pack_id, execution_id, source_uri, title, excerpt, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
        for (const item of this.items) {
            stmt.run(`ei_${nanoid(8)}`, packId, item.executionId, item.sourceUri ?? null, item.title ?? null, item.excerpt, item.confidence);
        }
    });
    tx();
    db.close();

    return packId;
  }

  formatForPrompt(): string {
    if (this.items.length === 0) return 'No direct tool evidence retrieved.';

    return this.items.map((item, i) => `
[EVIDENCE #${i + 1}]
Source: ${item.sourceUri ?? 'Internal tool output'}
Title: ${item.title ?? 'Untiled'}
Content: ${item.excerpt}
---`.trim()).join('\n\n');
  }
}
