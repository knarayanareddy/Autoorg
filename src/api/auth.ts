/**
 * API authentication.
 *
 * The approval, interview, hosted-run and webhook endpoints were completely
 * unauthenticated while CORS was `*`, so any page the operator visited could
 * approve a staged commit. This module is the single place that decides whether
 * a request may mutate state.
 *
 * Model
 * ─────
 * - `AUTOORG_API_KEY` enables authentication. Accepted as
 *   `Authorization: Bearer <key>` or `x-api-key: <key>`.
 * - Auth is MANDATORY whenever the server is not bound to loopback. Booting an
 *   unauthenticated server on a public interface is refused rather than warned
 *   about, because "approve arbitrary commits" is not a safe default.
 * - Read-only endpoints stay open in local/dev to keep the dashboard usable;
 *   every mutating endpoint requires the key once one is configured.
 *
 * Set `AUTOORG_API_KEY` in `.env` for anything other than a local run.
 */

import { timingSafeEqual } from 'node:crypto';

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Constant-time comparison that is also safe for differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch; compare a digest-length-stable
  // value instead of leaking the length via early return.
  if (ab.length !== bb.length) {
    // Still do a comparison to avoid a trivially observable fast path.
    timingSafeEqual(ab, Buffer.alloc(ab.length));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export interface AuthConfig {
  /** Configured API key, or null when auth is disabled. */
  apiKey: string | null;
  /** True when the key comes from the DB-managed bootstrap secret. */
  required: boolean;
}

export function getAuthConfig(): AuthConfig {
  const apiKey = process.env.AUTOORG_API_KEY?.trim() || null;
  return { apiKey, required: apiKey !== null };
}

export interface AuthResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Check an incoming request.
 *
 * @param req        The incoming request.
 * @param mutating   True for POST/PUT/PATCH/DELETE. Mutating requests require
 *                   the key whenever one is configured; reads do not, so the
 *                   dashboard keeps working locally.
 */
export function authenticate(req: Request, mutating: boolean): AuthResult {
  const { apiKey } = getAuthConfig();

  if (!apiKey) {
    // No key configured: allow, but only because the boot guard refuses to
    // start on a non-loopback interface without one.
    return { ok: true };
  }

  if (!mutating) return { ok: true };

  const header = req.headers.get('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : null;
  const provided = bearer ?? req.headers.get('x-api-key')?.trim() ?? '';

  if (!provided) {
    return { ok: false, status: 401, error: 'Missing API key' };
  }
  if (!safeEqual(provided, apiKey)) {
    return { ok: false, status: 403, error: 'Invalid API key' };
  }
  return { ok: true };
}

/**
 * CORS origin allowlist.
 *
 * Wildcard CORS plus an unauthenticated approval endpoint meant any origin
 * could act on the operator's behalf. Default to same-origin (no header) and
 * only echo an allowlisted origin.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const configured = (process.env.AUTOORG_CORS_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-hub-signature-256, x-github-event, x-github-delivery',
    'Vary': 'Origin',
  };

  if (origin && configured.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else if (!origin && configured.length === 0) {
    // No Origin header (curl, server-to-server): nothing to negotiate.
  }

  return headers;
}

/**
 * Refuse to boot an unauthenticated server on a non-loopback interface.
 * Returns an error message, or null when the configuration is safe.
 */
export function checkBootSafety(hostname: string | undefined): string | null {
  const host = (hostname ?? '0.0.0.0').toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const { apiKey } = getAuthConfig();

  if (!apiKey && !isLoopback) {
    return (
      'AUTOORG_API_KEY is not set, but the API is bound to ' + host + '. ' +
      'Refusing to expose unauthenticated approval endpoints. ' +
      'Set AUTOORG_API_KEY, or bind to 127.0.0.1 for local use.'
    );
  }
  return null;
}

/** Authorize WebSocket upgrades independently of open HTTP read endpoints. */
export function authorizeWsUpgrade(req: Request, peer: string | null): AuthResult {
  const apiKey = getAuthConfig().apiKey;
  if (apiKey) {
    // A loopback peer may be a reverse proxy for an arbitrary remote client.
    // Never exempt it when a key is configured.
    const provided = req.headers.get('x-api-key')?.trim() || new URL(req.url).searchParams.get('token') || '';
    if (!provided) return { ok: false, status: 401, error: 'Missing API key' };
    if (!safeEqual(provided, apiKey)) return { ok: false, status: 403, error: 'Invalid API key' };
    return { ok: true };
  }

  const local = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (!local) return { ok: false, status: 403, error: 'Local access only' };
  const origin = req.headers.get('origin');
  if (origin) {
    const allowed = (process.env.AUTOORG_CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const localDashboard = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (origin !== new URL(req.url).origin && !allowed.includes(origin) && !localDashboard.includes(origin)) {
      return { ok: false, status: 403, error: 'Origin not allowed' };
    }
  }
  return { ok: true };
}
