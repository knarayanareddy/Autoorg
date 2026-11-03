/** Per-peer authentication failure throttling. Never trust forwarded IP headers. */
type State = { failures: number[]; lockedUntil: number; lockouts: number; lastSeen: number };
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 10_000;
const IDLE_MS = 15 * 60_000;

export class AuthRateLimiter {
  private readonly states = new Map<string, State>();

  retryAfter(peer: string, now = Date.now()): number {
    const state = this.states.get(peer);
    if (!state) {
      // Bound memory without allowing new addresses to evict active lockouts.
      if (this.states.size >= MAX_ENTRIES) {
        for (const [key, value] of this.states) {
          if (value.lockedUntil <= now && now - value.lastSeen > IDLE_MS) this.states.delete(key);
        }
        if (this.states.size >= MAX_ENTRIES) return 60;
      }
      return 0;
    }
    return Math.max(0, Math.ceil((state.lockedUntil - now) / 1000));
  }

  recordFailure(peer: string, now = Date.now()): void {
    let state = this.states.get(peer);
    if (!state) {
      if (this.states.size >= MAX_ENTRIES) return;
      state = { failures: [], lockedUntil: 0, lockouts: 0, lastSeen: now };
      this.states.set(peer, state);
    }
    if (state.lockedUntil > now) return;
    if (now - state.lastSeen > IDLE_MS) state.lockouts = 0;
    state.failures = state.failures.filter(time => now - time < WINDOW_MS);
    state.failures.push(now);
    state.lastSeen = now;
    if (state.failures.length >= 10) {
      state.lockedUntil = now + Math.min(300_000, 30_000 * 2 ** Math.min(state.lockouts, 4));
      state.lockouts++;
      state.failures = [];
    }
  }

  recordSuccess(peer: string): void { this.states.delete(peer); }
}
