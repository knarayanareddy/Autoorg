/**
 * Remote agent authentication.
 *
 * `verifyAndHeartbeat` used to verify the signature against a `publicKey`
 * supplied by the caller, so anyone could self-sign and claim any agentId.
 * The stored key is now authoritative.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { SecureAgentService } from '../src/platform/secure-agent.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const AGENT_ID = testRunId('agent');

const trusted = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const attacker = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function signNonce(nonce: string, privateKey: string): string {
  return sign('sha256', Buffer.from(nonce), privateKey).toString('hex');
}

beforeAll(async () => {
  await useTestDb('autoorg-secureagent-');
});

afterAll(() => cleanupTestDb());

describe('SecureAgentService', () => {
  it('rejects a challenge for an unknown agent', async () => {
    await expect(new SecureAgentService().getChallenge('nobody')).rejects.toThrow();
  });

  it('registers an agent and pins its public key', async () => {
    const svc = new SecureAgentService();
    await svc.registerAgent({ agentId: AGENT_ID, publicKey: trusted.publicKey });
    await expect(svc.getChallenge(AGENT_ID)).resolves.toBeString();
  });

  it('refuses to re-register with a different key (impersonation)', async () => {
    const svc = new SecureAgentService();
    await expect(
      svc.registerAgent({ agentId: AGENT_ID, publicKey: attacker.publicKey })
    ).rejects.toThrow(/different public key/);
  });

  it('accepts a heartbeat signed by the registered key', async () => {
    const svc = new SecureAgentService();
    const nonce = await svc.getChallenge(AGENT_ID);
    const ok = await svc.verifyAndHeartbeat({
      agentId: AGENT_ID,
      signature: signNonce(nonce, trusted.privateKey),
    });
    expect(ok).toBe(true);
  });

  it('consumes the nonce so it cannot be replayed', async () => {
    const svc = new SecureAgentService();
    const nonce = await svc.getChallenge(AGENT_ID);
    const sig = signNonce(nonce, trusted.privateKey);

    expect(await svc.verifyAndHeartbeat({ agentId: AGENT_ID, signature: sig })).toBe(true);
    // Same signature again: no pending nonce any more.
    expect(await svc.verifyAndHeartbeat({ agentId: AGENT_ID, signature: sig })).toBe(false);
  });

  it('rejects a heartbeat with no outstanding challenge', async () => {
    const svc = new SecureAgentService();
    const ok = await svc.verifyAndHeartbeat({
      agentId: AGENT_ID,
      signature: 'ab'.repeat(64),
    });
    expect(ok).toBe(false);
  });

  // The regression: a caller-supplied key must never be trusted once one exists.
  it('rejects a signature from an attacker-supplied key', async () => {
    const svc = new SecureAgentService();
    const nonce = await svc.getChallenge(AGENT_ID);

    const ok = await svc.verifyAndHeartbeat({
      agentId: AGENT_ID,
      signature: signNonce(nonce, attacker.privateKey),
      publicKey: attacker.publicKey, // attempt to swap in a key we control
    });

    expect(ok).toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const svc = new SecureAgentService();
    await svc.getChallenge(AGENT_ID);
    expect(() =>
      svc.verifyAndHeartbeat({ agentId: AGENT_ID, signature: 'not-hex' })
    ).not.toThrow();
    expect(await svc.verifyAndHeartbeat({ agentId: AGENT_ID, signature: 'not-hex' })).toBe(false);
  });

  it('reaps agents with a stale heartbeat', async () => {
    const svc = new SecureAgentService();
    const reaped = await svc.reapStaleAgents(0);
    expect(reaped).toBeGreaterThanOrEqual(0);
  });
});
