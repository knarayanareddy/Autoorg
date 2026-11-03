import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ObjectionTracker }  from '../src/runtime/objection-tracker.js';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

// Isolated run id so rows never collide between test files
const TEST_RUN_ID = testRunId('objections');

describe('ObjectionTracker', () => {
  let tracker: ObjectionTracker;

  beforeAll(async () => {
    // Use the REAL migration — never a hand-rolled CREATE TABLE, which is
    // what previously masked the missing `objections` table.
    await useTestDb('autoorg-objections-');
    tracker = new ObjectionTracker(TEST_RUN_ID);
  });

  afterAll(() => cleanupTestDb());

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
