TypeScript

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(':');
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(digest, 'hex');
  return original.length === derived.length && timingSafeEqual(original, derived);
}

export class AuthService {
  createUser(opts: {
    email: string;
    displayName: string;
    password?: string;
  }) {
    const db = getDb();
    const id = `usr_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO users
      (id, email, display_name, password_hash, auth_provider, status)
      VALUES (?, ?, ?, ?, 'local', 'active')
    `).run(
      id,
      opts.email.toLowerCase(),
      opts.displayName,
      opts.password ? hashPassword(opts.password) : null
    );

    db.close();
    return { userId: id };
  }

  createTenant(opts: {
    slug: string;
    displayName: string;
    ownerUserId: string;
    planTier?: 'free' | 'team' | 'enterprise' | 'internal';
  }) {
    const db = getDb();
    const tenantId = `ten_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO tenants
      (id, slug, display_name, plan_tier, status, settings_json)
      VALUES (?, ?, ?, ?, 'active', '{}')
    `).run(
      tenantId,
      opts.slug,
      opts.displayName,
      opts.planTier ?? 'team'
    );

    db.prepare(`
      INSERT INTO memberships
      (id, tenant_id, user_id, role_key, status)
      VALUES (?, ?, ?, 'owner', 'active')
    `).run(`mem_${nanoid(10)}`, tenantId, opts.ownerUserId);

    db.close();
    return { tenantId };
  }

  login(opts: {
    email: string;
    password: string;
    tenantId?: string;
  }) {
    const db = getDb();
    const user = db.prepare(`
      SELECT * FROM users WHERE email = ?
    `).get(opts.email.toLowerCase()) as
      | { id: string; password_hash: string | null }
      | undefined;

    if (!user?.password_hash || !verifyPassword(opts.password, user.password_hash)) {
      db.close();
      return null;
    }

    const token = `sess_${randomBytes(24).toString('hex')}`;
    const sessionId = `ses_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO sessions
      (id, user_id, tenant_id, session_token_hash, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, datetime('now', '+30 days'), datetime('now'))
    `).run(
      sessionId,
      user.id,
      opts.tenantId ?? null,
      sha256(token)
    );

    db.prepare(`
      UPDATE users SET last_seen_at = datetime('now') WHERE id = ?
    `).run(user.id);

    db.close();

    return {
      sessionId,
      token,
      userId: user.id,
    };
  }

  verifySession(token: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM sessions
      WHERE session_token_hash = ?
        AND expires_at > datetime('now')
      LIMIT 1
    `).get(sha256(token)) as any;
    db.close();
    return row ?? null;
  }

  createApiKey(opts: {
    tenantId: string;
    userId?: string;
    keyName: string;
    scopes: string[];
    expiresAt?: string;
  }) {
    const raw = `ak_${randomBytes(24).toString('hex')}`;
    const db = getDb();
    const id = `key_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO api_keys
      (id, tenant_id, user_id, key_name, key_prefix, key_hash, scopes_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      opts.tenantId,
      opts.userId ?? null,
      opts.keyName,
      raw.slice(0, 10),
      sha256(raw),
      JSON.stringify(opts.scopes),
      opts.expiresAt ?? null
    );

    db.close();

    return {
      apiKeyId: id,
      rawKey: raw,
    };
  }

  verifyApiKey(rawKey: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM api_keys
      WHERE key_hash = ?
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      LIMIT 1
    `).get(sha256(rawKey)) as any;
    db.close();
    return row ?? null;
  }
}
3. RBAC