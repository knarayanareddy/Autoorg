/**
 * Baseline response headers.
 *
 * NOTE: no `Access-Control-Allow-Origin` here. CORS is decided per request by
 * `corsHeaders()` in `./auth.ts` from the `AUTOORG_CORS_ORIGINS` allowlist. A
 * hardcoded `*` combined with unauthenticated POST endpoints let any origin
 * approve staged commits.
 */
export const CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-hub-signature-256, x-github-event, x-github-delivery',
  'Content-Type':                 'application/json',
};

export function json(data: unknown, statusOrOpts: number | { status: number } = 200): Response {
  const status = typeof statusOrOpts === 'number' ? statusOrOpts : statusOrOpts.status;
  return new Response(JSON.stringify(data), { 
    status, 
    headers: CORS 
  });
}

export function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

export function serverError(): Response {
  return json({ error: 'Internal server error' }, 500);
}

/** An explicitly safe client-facing error, never constructed from raw input. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (err) {
    if (err instanceof SyntaxError) throw new HttpError(400, 'Invalid JSON');
    throw err;
  }
}

export function registerRoute(pattern: string, handler: (params: Record<string, string>) => Response) {
    // Basic route registration logic if needed
}

export function matchRoute(
  url: URL,
  method: string,
  pattern: string,
  reqMethod: string
): Record<string, string> | null {
  if (method !== reqMethod && reqMethod !== 'OPTIONS') return null;

  const patternParts = pattern.split('/').filter(Boolean);
  const urlParts     = url.pathname.split('/').filter(Boolean);
  if (patternParts.length !== urlParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!;
    const u = urlParts[i]!;
    if (p.startsWith(':')) {
      params[p.slice(1)] = u;
    } else if (p !== u) {
      return null;
    }
  }
  return params;
}
