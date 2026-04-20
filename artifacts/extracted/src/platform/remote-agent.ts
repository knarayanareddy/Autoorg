TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { HostedRunner } from '@/platform/hosted-runner.js';

export class RemoteAgentService {
  private hosted = new HostedRunner();

  register(opts: {
    tenantId?: string;
    agentName: string;
    deploymentMode: 'local' | 'single-node' | 'cloud-worker' | 'managed';
    capabilityJson?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    const id = `agt_${nanoid(10)}`;
    const db = getDb();

    db.prepare(`
      INSERT INTO remote_agents
      (id, tenant_id, agent_name, deployment_mode, capability_json, heartbeat_at, lease_expires_at, status, metadata_json)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+60 seconds'), 'idle', ?)
    `).run(
      id,
      opts.tenantId ?? null,
      opts.agentName,
      opts.deploymentMode,
      JSON.stringify(opts.capabilityJson ?? {}),
      JSON.stringify(opts.metadata ?? {})
    );

    db.close();
    return { agentId: id };
  }

  heartbeat(agentId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE remote_agents
      SET heartbeat_at = datetime('now'),
          lease_expires_at = datetime('now', '+60 seconds')
      WHERE id = ?
    `).run(agentId);
    db.close();
  }

  claimWork(agentId: string) {
    this.heartbeat(agentId);

    const db = getDb();
    const agent = db.prepare(`SELECT * FROM remote_agents WHERE id = ?`).get(agentId) as any;
    db.close();

    if (!agent || agent.status === 'disabled') return null;

    const run = this.hosted.claimQueuedRun(agentId);
    if (!run) return null;

    const db2 = getDb();
    db2.prepare(`
      UPDATE remote_agents
      SET status = 'busy'
      WHERE id = ?
    `).run(agentId);
    db2.close();

    return run;
  }

  markIdle(agentId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE remote_agents
      SET status = 'idle', heartbeat_at = datetime('now')
      WHERE id = ?
    `).run(agentId);
    db.close();
  }

  sweepOffline() {
    const db = getDb();
    db.prepare(`
      UPDATE remote_agents
      SET status = 'offline'
      WHERE lease_expires_at < datetime('now')
        AND status != 'disabled'
    `).run();
    db.close();
  }
}
10. Comments and collaboration