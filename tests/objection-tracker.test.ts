import { describe, it, expect, beforeAll } from 'bun:test';
import { ObjectionTracker }  from '../src/runtime/objection-tracker.js';

// Use a test run ID so we don't pollute real data
const TEST_RUN_ID = `test_run_${Date.now()}`;

describe('ObjectionTracker', () => {
  let tracker: ObjectionTracker;

  beforeAll(async () => {
    // Run Phase 0 + Phase 2 migrations first
    const { getDb } = await import('../src/db/migrate.js');
    const db = getDb();
    
    // Ensure objections table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS objections (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
        cycle_raised INTEGER NOT NULL, cycle_resolved INTEGER,
        severity TEXT NOT NULL, description TEXT NOT NULL,
        proposed_fix TEXT NOT NULL, evidence TEXT,
        resolved INTEGER NOT NULL DEFAULT 0, resolution_note TEXT,
        raised_by TEXT NOT NULL DEFAULT 'Critic',
        embedding BLOB, created_at DATETIME DEFAULT (datetime('now')),
        updated_at DATETIME DEFAULT (datetime('now'))
      )
    `);
    db.close();
    
    tracker = new ObjectionTracker(TEST_RUN_ID);
  });

  it('starts with no objections', () => {
    const stats = tracker.getStats();
    expect(stats.total).toBe(0);
    expect(stats.open).toBe(0);
  });

  it('raises new objections from Critic output', () => {
    const raised = tracker.raiseObjections(1, [
      { id: 'obj_1', severity: 'BLOCKER', description: 'Major groundedness issue', fix: 'Add citation', evidence: 'Line 3' },
      { id: 'obj_2', severity: 'MAJOR',   description: 'Missing evidence for claim X', fix: 'Cite source', evidence: 'Para 2' },
      { id: 'obj_3', severity: 'MINOR',   description: 'Awkward phrasing', fix: 'Rephrase', evidence: 'Title' },
    ]);

    expect(raised.length).toBe(3);
    expect(tracker.getStats().total).toBe(3);
    expect(tracker.getStats().open).toBe(3);
    expect(tracker.getStats().blockers).toBe(1);
  });

  it('returns open blockers correctly', () => {
    const blockers = tracker.getOpenBlockers();
    expect(blockers.length).toBe(1);
    expect(blockers[0]!.severity).toBe('BLOCKER');
  });

  it('resolves objections correctly', () => {
    const open    = tracker.getOpenObjections();
    const firstId = open[0]!.id;

    tracker.resolveObjections(2, [firstId], 'Fixed by CEO synthesis');

    const stats = tracker.getStats();
    expect(stats.resolved).toBe(1);
    expect(stats.open).toBe(2);
  });

  it('formats objections as context string', () => {
    const context = tracker.formatForContext(10);
    expect(context.length).toBeGreaterThan(10);
    expect(context).toContain('OPEN');
  });

  it('processCriticOutput raises and resolves in one call', () => {
    const before = tracker.getStats().open;

    tracker.processCriticOutput(3, {
      objections: [
        { id: 'obj_new', severity: 'MAJOR', description: 'New issue cycle 3', fix: 'Do X', evidence: 'Para 4' },
      ],
      resolved_from_previous: ['Missing evidence'], // partial match by description
    });

    const after = tracker.getStats();
    // Should have added 1 new
    expect(after.total).toBeGreaterThan(before);
  });
});
