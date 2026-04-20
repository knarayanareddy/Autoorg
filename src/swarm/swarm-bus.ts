import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface SwarmMessage {
  id: string;
  sender_run_id: string;
  receiver_run_id: string;
  message_type: 'request' | 'response' | 'event' | 'heartbeat';
  payload: any;
}

export class SwarmBus {
  constructor(private runId: string) {}

  async send(receiverRunId: string, type: SwarmMessage['message_type'], payload: any) {
    const db = getDb();
    const id = `msg_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO swarm_bus_messages (id, sender_run_id, receiver_run_id, message_type, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, this.runId, receiverRunId, type, JSON.stringify(payload));
    
    db.close();
    return id;
  }

  async pollInbox(): Promise<SwarmMessage[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM swarm_bus_messages 
      WHERE receiver_run_id = ? AND is_delivered = 0
    `).all(this.runId) as any[];

    if (rows.length === 0) {
      db.close();
      return [];
    }

    // Mark as delivered
    const ids = rows.map(r => r.id);
    db.prepare(`
      UPDATE swarm_bus_messages SET is_delivered = 1 
      WHERE id IN (${ids.map(() => '?').join(',')})
    `).run(...ids);

    db.close();

    return rows.map(r => ({
      id: r.id,
      sender_run_id: r.sender_run_id,
      receiver_run_id: r.receiver_run_id,
      message_type: r.message_type,
      payload: JSON.parse(r.payload_json),
    }));
  }

  async waitForResponse(requestId: string, timeoutMs: number = 30000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const db = getDb();
      const row = db.prepare(`
        SELECT payload_json FROM swarm_bus_messages 
        WHERE message_type = 'response' 
          AND payload_json LIKE ? 
          AND is_delivered = 0
      `).get(`%"request_id":"${requestId}"%`) as any;
      db.close();

      if (row) {
          const payload = JSON.parse(row.payload_json);
          // Mark as delivered manually since pollInbox might miss it if we are targeting a specific req
          const db2 = getDb();
          db2.prepare(`UPDATE swarm_bus_messages SET is_delivered = 1 WHERE payload_json LIKE ?`).run(`%"request_id":"${requestId}"%`);
          db2.close();
          return payload;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Timeout waiting for swarm response to message: ${requestId}`);
  }
}
