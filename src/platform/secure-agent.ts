import { createSign, createVerify, randomBytes } from 'node:crypto';
import { getDb } from '@/db/migrate.js';

/**
 * SecureAgent handles mTLS-like authentication for Cloud Agents
 * using signed heartbeats to prevent impersonation over public networks.
 */
export class SecureAgentService {
  /**
   * Generates a challenge for the agent to sign
   */
  async getChallenge(agentId: string) {
    const nonce = randomBytes(32).toString('hex');
    const db = getDb();
    db.prepare(`UPDATE remote_agents SET metadata_json = json_set(metadata_json, '$.pending_nonce', ?) WHERE id = ?`)
      .run(nonce, agentId);
    db.close();
    return nonce;
  }

  /**
   * Verifies the signed heartbeat from a cloud agent
   */
  async verifyAndHeartbeat(opts: {
    agentId: string;
    signature: string;
    publicKey: string;
  }) {
    const db = getDb();
    const agent = db.prepare(`SELECT metadata_json FROM remote_agents WHERE id = ?`).get(opts.agentId) as any;
    const metadata = JSON.parse(agent?.metadata_json || '{}');
    const nonce = metadata.pending_nonce;

    if (!nonce) {
      db.close();
      throw new Error('No pending challenge for agent');
    }

    const verifier = createVerify('sha256');
    verifier.update(nonce);
    verifier.end();

    const isValid = verifier.verify(opts.publicKey, opts.signature, 'hex');

    if (isValid) {
      db.prepare(`
        UPDATE remote_agents 
        SET heartbeat_at = datetime('now'),
            status = 'idle',
            metadata_json = json_remove(metadata_json, '$.pending_nonce')
        WHERE id = ?
      `).run(opts.agentId);
    }

    db.close();
    return isValid;
  }
}
