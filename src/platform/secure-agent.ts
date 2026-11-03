import { createVerify, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/db/migrate.js';

/**
 * SecureAgent handles challenge/response authentication for remote ("cloud")
 * agents over public networks.
 *
 * The previous implementation verified the heartbeat signature against a
 * `publicKey` supplied BY THE CALLER, so any client could self-sign and claim
 * any `agentId`. The public key is now loaded from `remote_agents.public_key`
 * and the caller's key is only accepted during first-time registration.
 *
 * Signing scheme: the agent signs the challenge nonce with its private key.
 * `createVerify('sha256')` therefore only works for RSA. Ed25519 agents must
 * use `crypto.verify(null, …)`; that path is handled explicitly below.
 */

/** Columns we are willing to touch; keeps the SQL statically checkable. */
const AGENT_COLUMNS = 'status, public_key, metadata_json, heartbeat_at';

export interface AgentRecord {
  id: string;
  tenant_id: string | null;
  display_name: string | null;
  status: string;
  public_key: string | null;
  metadata_json: string;
  registered_at: string;
  heartbeat_at: string | null;
}

function loadAgent(agentId: string): AgentRecord | undefined {
  const db = getDb();
  try {
    return db.prepare(
      `SELECT id, tenant_id, display_name, status, public_key, metadata_json, registered_at, heartbeat_at
       FROM remote_agents WHERE id = ?`
    ).get(agentId) as AgentRecord | undefined;
  } finally {
    db.close();
  }
}

function readNonce(metadataJson: string | null): string | null {
  try {
    const meta = JSON.parse(metadataJson ?? '{}') as { pending_nonce?: unknown };
    return typeof meta.pending_nonce === 'string' ? meta.pending_nonce : null;
  } catch {
    return null;
  }
}

export class SecureAgentService {
  /**
   * Issue a single-use challenge nonce for an agent.
   * Registration must have happened first (`registerAgent`).
   */
  async getChallenge(agentId: string): Promise<string> {
    const agent = loadAgent(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    if (!agent.public_key) {
      throw new Error(`Agent ${agentId} has no registered public key`);
    }

    const nonce = randomBytes(32).toString('hex');
    const db = getDb();
    try {
      // One json_set with both paths. Two separate `metadata_json = json_set(...)`
      // assignments in the same UPDATE each start from the ORIGINAL value, so the
      // second silently discards the first — which dropped the nonce entirely.
      db.prepare(
        `UPDATE remote_agents
         SET metadata_json = json_set(
               metadata_json,
               '$.pending_nonce', ?,
               '$.nonce_issued_at', ?
             )
         WHERE id = ?`
      ).run(nonce, new Date().toISOString(), agentId);
    } finally {
      db.close();
    }
    return nonce;
  }

  /**
   * Verify a signed heartbeat.
   *
   * @param opts.signature  Hex signature over the issued nonce.
   * @param opts.publicKey  Only used when the agent has NO stored key yet; it is
   *                        ignored otherwise, so a caller can never swap in
   *                        their own key to impersonate an existing agent.
   */
  async verifyAndHeartbeat(opts: {
    agentId: string;
    signature: string;
    publicKey?: string;
    algorithm?: 'rsa-sha256' | 'ed25519';
  }): Promise<boolean> {
    const agent = loadAgent(opts.agentId);
    if (!agent) return false;

    const nonce = readNonce(agent.metadata_json);
    if (!nonce) return false; // no challenge outstanding

    // Trust the stored key. Never the caller's, once one exists.
    const trustedKey = agent.public_key ?? opts.publicKey ?? null;
    if (!trustedKey) return false;

    if (opts.publicKey && agent.public_key && !safeEqualString(opts.publicKey, agent.public_key)) {
      // Caller tried to present a different key than the registered one.
      return false;
    }

    const isValid = verifySignature(nonce, opts.signature, trustedKey, opts.algorithm ?? 'rsa-sha256');
    if (!isValid) return false;

    const db = getDb();
    try {
      db.prepare(
        `UPDATE remote_agents
         SET heartbeat_at = datetime('now'),
             status = 'idle',
             metadata_json = json_remove(metadata_json, '$.pending_nonce')
         WHERE id = ?`
      ).run(opts.agentId);
    } finally {
      db.close();
    }
    return true;
  }

  /**
   * Register an agent and pin its public key. Idempotent: re-registering an
   * existing id is rejected rather than silently replacing the key, because
   * that would be a trivial impersonation path.
   */
  async registerAgent(opts: {
    agentId: string;
    publicKey: string;
    tenantId?: string;
    displayName?: string;
  }): Promise<void> {
    const existing = loadAgent(opts.agentId);
    const db = getDb();
    try {
      if (existing) {
        if (existing.public_key && !safeEqualString(existing.public_key, opts.publicKey)) {
          throw new Error(
            `Agent ${opts.agentId} is already registered with a different public key`
          );
        }
        return;
      }

      db.prepare(
        `INSERT INTO remote_agents (id, tenant_id, display_name, status, public_key, metadata_json)
         VALUES (?, ?, ?, 'offline', ?, '{}')`
      ).run(opts.agentId, opts.tenantId ?? null, opts.displayName ?? null, opts.publicKey);
    } finally {
      db.close();
    }
  }

  /** Mark agents offline when their heartbeat is stale. */
  async reapStaleAgents(maxAgeMinutes = 5): Promise<number> {
    const db = getDb();
    try {
      const result = db.prepare(
        `UPDATE remote_agents
         SET status = 'offline'
         WHERE status != 'offline'
           AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', ?))`
      ).run(`-${maxAgeMinutes} minutes`);
      return Number(result.changes ?? 0);
    } finally {
      db.close();
    }
  }
}

/** Constant-time string compare that tolerates different lengths. */
function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifySignature(
  nonce: string,
  signature: string,
  publicKey: string,
  algorithm: 'rsa-sha256' | 'ed25519'
): boolean {
  try {
    if (algorithm === 'ed25519') {
      // Ed25519 signs the message directly; there is no digest step.
      const { verify } = require('node:crypto') as typeof import('node:crypto');
      return verify(null, Buffer.from(nonce), publicKey, Buffer.from(signature, 'hex'));
    }

    const verifier = createVerify('sha256');
    verifier.update(nonce);
    verifier.end();
    return verifier.verify(publicKey, signature, 'hex');
  } catch {
    // A malformed key or signature is a rejection, not an exception.
    return false;
  }
}

export { AGENT_COLUMNS };
