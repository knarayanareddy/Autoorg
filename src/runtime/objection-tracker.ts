/**
 * AutoOrg — Persistent Cross-Cycle Objection Tracker
 *
 * This is the core Phase 2 innovation for the Critic agent.
 * Instead of raising fresh objections every cycle from scratch,
 * the Critic now has MEMORY of what it raised before.
 *
 * Lifecycle:
 *   raised → open → [resolved | escalated]
 *
 * The Ratchet Judge checks standing open BLOCKERs before scoring.
 * If a BLOCKER is still open and unresolved in the new proposal,
 * the consistency score is penalized regardless of other factors.
 *
 * Inspired by Claude Code's persistent memory architecture +
 * the Coordinator Mode "Do not rubber-stamp weak work" instruction.
 */

import { nanoid }    from 'nanoid';
import { getDb }     from '@/db/migrate.js';
import chalk         from 'chalk';
import type { ObjectionSeverity } from '@/types/index.js';

export interface Objection {
  id:              string;
  runId:           string;
  cycleRaised:     number;
  cycleResolved:   number | null;
  severity:        ObjectionSeverity;
  description:     string;
  proposedFix:     string;
  evidence:        string;
  resolved:        boolean;
  resolutionNote:  string | null;
}

export interface ObjectionDelta {
  newlyRaised:  Objection[];
  nowResolved:  Objection[];
  stillOpen:    Objection[];
  escalated:    Objection[];  // MINOR → MAJOR or MAJOR → BLOCKER
}

export class ObjectionTracker {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  // ── Load all open objections for this run ─────────────────────────
  getOpenObjections(): Objection[] {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT * FROM objections
      WHERE run_id = ? AND resolved = 0
      ORDER BY
        CASE severity WHEN 'BLOCKER' THEN 1 WHEN 'MAJOR' THEN 2 ELSE 3 END,
        cycle_raised DESC
    `).all(this.runId) as Array<{
      id: string; run_id: string; cycle_raised: number; cycle_resolved: number | null;
      severity: string; description: string; proposed_fix: string; evidence: string;
      resolved: number; resolution_note: string | null;
    }>;
    db.close();

    return rows.map(r => ({
      id:            r.id,
      runId:         r.run_id,
      cycleRaised:   r.cycle_raised,
      cycleResolved: r.cycle_resolved,
      severity:      r.severity as ObjectionSeverity,
      description:   r.description,
      proposedFix:   r.proposed_fix,
      evidence:      r.evidence ?? '',
      resolved:      r.resolved === 1,
      resolutionNote: r.resolution_note,
    }));
  }

  // ── Get open BLOCKERs only ─────────────────────────────────────────
  getOpenBlockers(): Objection[] {
    return this.getOpenObjections().filter(o => o.severity === 'BLOCKER');
  }

  // ── Load all objections (including resolved) ───────────────────────
  getAllObjections(): Objection[] {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT * FROM objections WHERE run_id = ? ORDER BY cycle_raised DESC
    `).all(this.runId) as Array<Record<string, unknown>>;
    db.close();

    return rows.map(r => ({
      id:            r.id as string,
      runId:         r.run_id as string,
      cycleRaised:   r.cycle_raised as number,
      cycleResolved: r.cycle_resolved as number | null,
      severity:      r.severity as ObjectionSeverity,
      description:   r.description as string,
      proposedFix:   r.proposed_fix as string,
      evidence:      r.evidence as string ?? '',
      resolved:      (r.resolved as number) === 1,
      resolutionNote: r.resolution_note as string | null,
    }));
  }

  // ── Record new objections from Critic ─────────────────────────────
  raiseObjections(
    cycleNumber: number,
    rawObjections: Array<{
      id:          string;
      severity:    string;
      description: string;
      fix:         string;
      evidence:    string;
    }>
  ): Objection[] {
    const db     = getDb();
    const raised: Objection[] = [];
    const insert = db.prepare(`
      INSERT OR IGNORE INTO objections
        (id, run_id, cycle_raised, severity, description, proposed_fix, evidence, resolved)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const insertMany = db.transaction(() => {
      for (const raw of rawObjections) {
        const objId = `obj_${nanoid(8)}`;
        insert.run(
          objId,
          this.runId,
          cycleNumber,
          raw.severity,
          raw.description,
          raw.fix,
          raw.evidence ?? ''
        );

        raised.push({
          id:            objId,
          runId:         this.runId,
          cycleRaised:   cycleNumber,
          cycleResolved: null,
          severity:      raw.severity as ObjectionSeverity,
          description:   raw.description,
          proposedFix:   raw.fix,
          evidence:      raw.evidence ?? '',
          resolved:      false,
          resolutionNote: null,
        });
      }
    });

    insertMany();
    db.close();

    const blockerCount = raised.filter(o => o.severity === 'BLOCKER').length;
    const majorCount   = raised.filter(o => o.severity === 'MAJOR').length;
    const minorCount   = raised.filter(o => o.severity === 'MINOR').length;

    if (blockerCount > 0) {
      console.log(chalk.bold.red(`    🚨 ${blockerCount} BLOCKER(s) raised this cycle`));
    }
    if (majorCount > 0) {
      console.log(chalk.red(`    ⚠  ${majorCount} MAJOR(s) raised`));
    }
    if (minorCount > 0) {
      console.log(chalk.gray(`    ·  ${minorCount} MINOR(s) noted`));
    }

    return raised;
  }

  // ── Mark objections as resolved ────────────────────────────────────
  resolveObjections(
    cycleNumber:   number,
    resolvedIds:   string[],
    resolutionNote: string = 'Resolved by CEO synthesis'
  ): void {
    if (resolvedIds.length === 0) return;

    const db      = getDb();
    const resolve = db.prepare(`
      UPDATE objections
      SET resolved = 1, cycle_resolved = ?, resolution_note = ?, updated_at = datetime('now')
      WHERE id = ? AND run_id = ?
    `);

    const resolveMany = db.transaction(() => {
      for (const id of resolvedIds) {
        resolve.run(cycleNumber, resolutionNote, id, this.runId);
      }
    });

    resolveMany();
    db.close();

    if (resolvedIds.length > 0) {
      console.log(chalk.green(`    ✓ ${resolvedIds.length} objection(s) resolved`));
    }
  }

  // ── Process Critic output: raise new, resolve old ─────────────────
  processCriticOutput(
    cycleNumber:      number,
    criticRawOutput: {
      objections: Array<{
        id:       string;
        severity: string;
        description: string;
        fix:      string;
        evidence: string;
      }>;
      resolved_from_previous: string[];
    }
  ): ObjectionDelta {
    const existingOpen = this.getOpenObjections();

    // Raise new objections
    const newlyRaised = this.raiseObjections(cycleNumber, criticRawOutput.objections);

    // Resolve objections Critic says are fixed
    if (criticRawOutput.resolved_from_previous.length > 0) {
      // Match by partial description match (IDs may differ across cycles)
      const toResolve = existingOpen
        .filter(o => criticRawOutput.resolved_from_previous.some(resolved =>
          o.description.toLowerCase().includes(resolved.toLowerCase()) ||
          o.id === resolved
        ))
        .map(o => o.id);

      this.resolveObjections(cycleNumber, toResolve, `Resolved in cycle ${cycleNumber}`);
    }

    const stillOpen   = this.getOpenObjections();
    const nowResolved = existingOpen.filter(o =>
      !stillOpen.some(s => s.id === o.id)
    );

    return {
      newlyRaised,
      nowResolved,
      stillOpen,
      escalated: [], // Phase 4: escalation logic
    };
  }

  // ── Format open objections as context for agents ──────────────────
  formatForContext(maxObjections: number = 10): string {
    const open = this.getOpenObjections().slice(0, maxObjections);
    if (open.length === 0) return '[No open objections]';

    const blockers = open.filter(o => o.severity === 'BLOCKER');
    const majors   = open.filter(o => o.severity === 'MAJOR');
    const minors   = open.filter(o => o.severity === 'MINOR');

    const lines: string[] = [];

    if (blockers.length > 0) {
      lines.push('### 🚨 OPEN BLOCKERS (MUST RESOLVE BEFORE COMMITTING)');
      for (const b of blockers) {
        lines.push(`[${b.id}] (Cycle ${b.cycleRaised}): ${b.description}`);
        lines.push(`  Fix: ${b.proposedFix}`);
      }
    }

    if (majors.length > 0) {
      lines.push('\n### ⚠ OPEN MAJORS');
      for (const m of majors) {
        lines.push(`[${m.id}] (Cycle ${m.cycleRaised}): ${m.description}`);
        lines.push(`  Fix: ${m.proposedFix}`);
      }
    }

    if (minors.length > 0) {
      lines.push(`\n### OPEN MINORS (${minors.length} — not shown in full)`);
    }

    return lines.join('\n');
  }

  // ── Statistics ────────────────────────────────────────────────────
  getStats(): {
    total: number;
    open: number;
    resolved: number;
    blockers: number;
    majors: number;
    oldestOpenCycle: number | null;
  } {
    const db   = getDb();
    const row  = db.prepare(`
      SELECT
        COUNT(*)                                       AS total,
        COUNT(CASE WHEN resolved=0 THEN 1 END)         AS open,
        COUNT(CASE WHEN resolved=1 THEN 1 END)         AS resolved,
        COUNT(CASE WHEN severity='BLOCKER' AND resolved=0 THEN 1 END) AS blockers,
        COUNT(CASE WHEN severity='MAJOR'   AND resolved=0 THEN 1 END) AS majors,
        MIN(CASE WHEN resolved=0 THEN cycle_raised END)               AS oldest_open
      FROM objections WHERE run_id = ?
    `).get(this.runId) as {
      total: number; open: number; resolved: number;
      blockers: number; majors: number; oldest_open: number | null;
    };
    db.close();

    return {
      total:           row.total,
      open:            row.open,
      resolved:        row.resolved,
      blockers:        row.blockers,
      majors:          row.majors,
      oldestOpenCycle: row.oldest_open,
    };
  }
}
