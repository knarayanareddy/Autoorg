TypeScript

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class EvidencePackBuilder {
  constructor(private runId: string) {}

  async fromExecutions(opts: {
    cycleNumber: number;
    ownerRole: string;
    kind: 'worker' | 'team' | 'ceo' | 'merged';
    taskId?: string;
    teamId?: string;
    executionIds: string[];
    summary: string;
  }) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT te.id, te.tool_name, te.output_summary, ta.source_uri, ta.title, ta.excerpt
      FROM tool_executions te
      LEFT JOIN tool_artifacts ta ON ta.execution_id = te.id
      WHERE te.id IN (${opts.executionIds.map(() => '?').join(',')})
      ORDER BY te.created_at ASC
    `).all(...opts.executionIds) as Array<{
      id: string;
      tool_name: string;
      output_summary: string | null;
      source_uri: string | null;
      title: string | null;
      excerpt: string | null;
    }>;

    const packId = `ep_${nanoid(10)}`;
    const dir = path.join(process.cwd(), 'artifacts', 'evidence', 'packs');
    await mkdir(dir, { recursive: true });
    const artifactPath = path.join(dir, `${packId}.md`);

    const markdown = [
      `# Evidence Pack ${packId}`,
      ``,
      `- run: ${this.runId}`,
      `- cycle: ${opts.cycleNumber}`,
      `- owner: ${opts.ownerRole}`,
      `- kind: ${opts.kind}`,
      `- summary: ${opts.summary}`,
      ``,
      `## Evidence Items`,
      ...rows.map((row, i) => [
        `### [ev_${i + 1}] ${row.tool_name}`,
        `- execution: ${row.id}`,
        `- title: ${row.title ?? '(untitled)'}`,
        `- source: ${row.source_uri ?? '(none)'}`,
        `- summary: ${row.output_summary ?? ''}`,
        ``,
        `${(row.excerpt ?? '').slice(0, 900)}`,
        ``,
      ].join('\n')),
    ].join('\n');

    await writeFile(artifactPath, markdown, 'utf-8');

    db.prepare(`
      INSERT INTO evidence_packs
      (id, run_id, cycle_number, task_id, team_id, owner_role, kind, summary, artifact_path, item_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      packId,
      this.runId,
      opts.cycleNumber,
      opts.taskId ?? null,
      opts.teamId ?? null,
      opts.ownerRole,
      opts.kind,
      opts.summary,
      artifactPath,
      rows.length,
    );

    rows.forEach((row, i) => {
      db.prepare(`
        INSERT INTO evidence_items
        (id, pack_id, execution_id, source_uri, title, excerpt, confidence, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `ei_${nanoid(8)}`,
        packId,
        row.id,
        row.source_uri ?? null,
        row.title ?? null,
        row.excerpt ?? '',
        0.75,
        JSON.stringify({ evidenceLabel: `ev_${i + 1}`, toolName: row.tool_name }),
      );
    });

    db.close();
    return { packId, artifactPath };
  }

  async merge(opts: {
    cycleNumber: number;
    ownerRole: string;
    packIds: string[];
    summary: string;
  }) {
    const db = getDb();
    const packs = db.prepare(`
      SELECT id, artifact_path
      FROM evidence_packs
      WHERE id IN (${opts.packIds.map(() => '?').join(',')})
    `).all(...opts.packIds) as Array<{ id: string; artifact_path: string }>;
    db.close();

    const mergedId = `ep_${nanoid(10)}`;
    const out = path.join(process.cwd(), 'artifacts', 'evidence', 'merged', `${mergedId}.md`);
    await mkdir(path.dirname(out), { recursive: true });

    const sections = [];
    for (const pack of packs) {
      const text = await Bun.file(pack.artifact_path).text().catch(() => '');
      sections.push(`\n\n<!-- PACK ${pack.id} -->\n\n${text}`);
    }

    await writeFile(out, [
      `# Merged Evidence Pack ${mergedId}`,
      ``,
      `Summary: ${opts.summary}`,
      ...sections,
    ].join('\n'), 'utf-8');

    return { packId: mergedId, artifactPath: out };
  }
}
9. Replayable tool traces