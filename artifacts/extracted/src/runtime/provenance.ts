TypeScript

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { PROVENANCE_LINKER_SYSTEM_PROMPT, ProvenanceLinkSchema } from '@/prompts/provenance-linker.js';

function claimHash(text: string) {
  return createHash('sha256').update(text.trim()).digest('hex');
}

export class ProvenanceBuilder {
  constructor(private runId: string) {}

  async linkDraft(opts: {
    cycleNumber: number;
    role: string;
    draft: string;
    taskId?: string;
    evidencePackId?: string;
  }) {
    const db = getDb();
    const evidenceRows = opts.evidencePackId
      ? db.prepare(`
          SELECT id, execution_id, title, metadata_json
          FROM evidence_items
          WHERE pack_id = ?
        `).all(opts.evidencePackId) as Array<{
          id: string;
          execution_id: string | null;
          title: string | null;
          metadata_json: string;
        }>
      : [];
    db.close();

    const evidenceByLabel = new Map<string, {
      id: string;
      executionId: string | null;
      graphNodeRef?: string;
      sourceChunkRef?: string;
      seedMaterialRef?: string;
    }>();

    for (const row of evidenceRows) {
      const meta = JSON.parse(row.metadata_json || '{}');
      const label = meta.evidenceLabel;
      if (!label) continue;
      evidenceByLabel.set(label, {
        id: row.id,
        executionId: row.execution_id,
        graphNodeRef: meta.graphNodeRef,
        sourceChunkRef: meta.sourceChunkRef,
        seedMaterialRef: meta.seedMaterialRef,
      });
    }

    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const parsed = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: PROVENANCE_LINKER_SYSTEM_PROMPT },
        { role: 'user', content: opts.draft.slice(0, 20000) },
      ],
      schema: ProvenanceLinkSchema,
    });

    const db2 = getDb();
    let linkedClaims = 0;
    let brokenLinks = 0;

    for (const claim of parsed.claims) {
      const claimId = `cl_${nanoid(10)}`;

      db2.prepare(`
        INSERT INTO claim_registry
        (id, run_id, cycle_number, role, task_id, evidence_pack_id, claim_text, claim_hash, support_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        claimId,
        this.runId,
        opts.cycleNumber,
        opts.role,
        opts.taskId ?? null,
        opts.evidencePackId ?? null,
        claim.claim_text,
        claimHash(claim.claim_text),
        claim.support_level
      );

      let anyLinked = false;

      for (const label of claim.citation_labels) {
        const ev = evidenceByLabel.get(label);
        if (!ev) {
          brokenLinks += 1;
          continue;
        }

        anyLinked = true;

        db2.prepare(`
          INSERT INTO claim_citations
          (id, claim_id, evidence_item_id, tool_execution_id, citation_label, graph_node_ref, source_chunk_ref, seed_material_ref, confidence, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `cc_${nanoid(10)}`,
          claimId,
          ev.id,
          ev.executionId ?? null,
          label,
          ev.graphNodeRef ?? null,
          ev.sourceChunkRef ?? null,
          ev.seedMaterialRef ?? null,
          claim.support_level === 'supported' ? 0.9 : claim.support_level === 'partial' ? 0.6 : 0.4,
          JSON.stringify({})
        );
      }

      if (anyLinked) linkedClaims += 1;
    }

    const report = {
      total_claims: parsed.claims.length,
      linked_claims: linkedClaims,
      broken_links: brokenLinks,
      unsupported_claims: parsed.claims.filter(c => c.support_level === 'unsupported').length,
    };

    db2.prepare(`
      INSERT INTO provenance_reports
      (id, run_id, cycle_number, role, evidence_pack_id, total_claims, linked_claims, broken_links, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `prv_${nanoid(10)}`,
      this.runId,
      opts.cycleNumber,
      opts.role,
      opts.evidencePackId ?? null,
      report.total_claims,
      report.linked_claims,
      report.broken_links,
      JSON.stringify(report)
    );

    db2.close();
    return report;
  }
}
12. Policy auditor prompt