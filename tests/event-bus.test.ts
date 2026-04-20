import { describe, it, expect } from 'bun:test';
import { eventBus } from '../src/runtime/event-bus.js';

describe('EventBus', () => {
  it('starts with zero clients', () => {
    expect(eventBus.clientCount).toBe(0);
  });

  it('adds and removes clients', () => {
    const fakeClient = { send: () => {}, readyState: 1 };
    eventBus.addClient(fakeClient);
    expect(eventBus.clientCount).toBe(1);
    eventBus.removeClient(fakeClient);
    expect(eventBus.clientCount).toBe(0);
  });

  it('broadcasts without crashing when no clients connected', () => {
    expect(() => eventBus.broadcast({ type: 'test_event' })).not.toThrow();
  });

  it('setRunId updates the run context', () => {
    eventBus.setRunId('run_test_123');
    // Verify it doesn't throw and run_id is included in broadcasts
    expect(() => eventBus.broadcast({ type: 'cycle_start', cycleNumber: 1, previousBest: 0 })).not.toThrow();
  });
});
