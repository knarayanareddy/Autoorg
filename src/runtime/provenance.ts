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

    const db = getDb();
    let linkedClaims = 0;
    
    const tx = db.transaction(() => {
        for (const claim of parsed.claims) {
          const claimId = `cl_${nanoid(10)}`;
          db.prepare(`
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

          if (claim.citation_labels.length > 0) {
              linkedClaims++;
              // Link to evidence items (simplified: store the label for manual tracing in UI)
              for (const label of claim.citation_labels) {
                db.prepare(`
                   INSERT INTO claim_citations (id, claim_id, citation_label, confidence)
                   VALUES (?, ?, ?, ?)
                `).run(`cc_${nanoid(10)}`, claimId, label, claim.support_level === 'supported' ? 0.9 : 0.5);
              }
          }
        }

        const report = {
            total_claims: parsed.claims.length,
            linked_claims: linkedClaims,
            unsupported_claims: parsed.claims.filter(c => c.support_level === 'unsupported').length,
        };

        db.prepare(`
            INSERT INTO provenance_reports
            (id, run_id, cycle_number, role, evidence_pack_id, total_claims, linked_claims, report_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`prv_${nanoid(10)}`, this.runId, opts.cycleNumber, opts.role, opts.evidencePackId ?? null, report.total_claims, report.linked_claims, JSON.stringify(report));
    });
    tx();
    db.close();

    return { totalClaims: parsed.claims.length, linkedClaims };
  }
}
