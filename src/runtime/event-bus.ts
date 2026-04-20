/**
 * AutoOrg — Event Bus
 *
 * Broadcasts orchestrator events to:
 * 1. Connected WebSocket clients (web dashboard)
 * 2. DB websocket_events table (for replay)
 * 3. Optional SSE endpoint for simpler clients
 *
 * This is the bridge between the orchestrator loop (async generator)
 * and the Next.js dashboard (MiroFish god's-eye view pattern).
 */

import { getDb } from '@/db/migrate.js';
import type { OrchestratorEvent } from '@/types/index.js';

type WebSocketClient = {
  send: (data: string) => void;
  readyState: number;
};

class EventBus {
  private clients:  Set<WebSocketClient> = new Set();
  private runId:    string = '';

  setRunId(runId: string): void {
    this.runId = runId;
  }

  addClient(ws: WebSocketClient): void {
    this.clients.add(ws);
    console.log(`[EventBus] Client connected. Total: ${this.clients.size}`);
  }

  removeClient(ws: WebSocketClient): void {
    this.clients.delete(ws);
    console.log(`[EventBus] Client disconnected. Total: ${this.clients.size}`);
  }

  // ── Broadcast to all connected clients ──────────────────────────────
  broadcast(event: OrchestratorEvent | Record<string, unknown>): void {
    const payload = JSON.stringify({
      ...event,
      ts:     new Date().toISOString(),
      run_id: this.runId,
    });

    // Send to WebSocket clients
    for (const client of this.clients) {
      try {
        if (client.readyState === 1) { // OPEN
          client.send(payload);
        }
      } catch {
        this.clients.delete(client);
      }
    }

    // Persist to DB for dashboard replay
    if (this.runId) {
      try {
        const db = getDb();
        db.prepare(`
          INSERT INTO websocket_events (run_id, event_type, payload)
          VALUES (?, ?, ?)
        `).run(
          this.runId,
          (event as OrchestratorEvent).type ?? 'unknown',
          payload
        );
        db.close();
      } catch {
        // Non-fatal — event bus failure should never crash the orchestrator
      }
    }
  }

  // ── Get recent events for dashboard initial load ───────────────────
  getRecentEvents(runId: string, limit = 100): Array<{
    event_type: string;
    payload: string;
    created_at: string;
  }> {
    try {
      const db   = getDb();
      const rows = db.prepare(`
        SELECT event_type, payload, created_at
        FROM websocket_events
        WHERE run_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(runId, limit) as Array<{ event_type: string; payload: string; created_at: string }>;
      db.close();
      return rows.reverse(); // Return chronologically
    } catch {
      return [];
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

// Singleton
export const eventBus = new EventBus();
