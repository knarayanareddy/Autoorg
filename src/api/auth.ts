/**
 * API authentication.
 *
 * The approval, interview, hosted-run and webhook endpoints were completely
 * unauthenticated while CORS was `*`, so any page the operator visited could
 * approve a staged commit. This module is the single place that decides whether
 * a request may mutate state.
 *
 * All HTTP requests and WebSocket upgrades require AUTOORG_API_KEY, even
 * on loopback. A local web page can send cross-origin requests to localhost,
 * so loopback binding alone is not an authentication boundary.
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
 * @param mutating   Retained for compatibility; all methods require the key.
 */
export function authenticate(req: Request, mutating: boolean): AuthResult {
  const { apiKey } = getAuthConfig();

  if (!apiKey) {
    return { ok: false, status: 503, error: 'API key not configured' };
  }


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
 * Refuse to boot an unauthenticated server, including on loopback.
 * Returns an error message, or null when the configuration is safe.
 */
export function checkBootSafety(hostname: string | undefined): string | null {
  if (!getAuthConfig().apiKey) {
    return `AUTOORG_API_KEY is not set; refusing to start the API on ${hostname ?? '0.0.0.0'}. Configure a strong key, including for loopback.`;
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

  return { ok: false, status: 503, error: 'API key not configured' };
}
