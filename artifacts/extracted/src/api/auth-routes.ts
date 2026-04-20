TypeScript

import { AuthService } from '@/platform/auth.js';

function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

export async function handleAuthRoutes(url: URL, req: Request) {
  const method = req.method;
  const auth = new AuthService();

  if (url.pathname === '/api/auth/signup' && method === 'POST') {
    const body = await req.json() as {
      email: string;
      displayName: string;
      password: string;
      tenantSlug: string;
      tenantDisplayName: string;
    };

    const user = auth.createUser({
      email: body.email,
      displayName: body.displayName,
      password: body.password,
    });

    const tenant = auth.createTenant({
      slug: body.tenantSlug,
      displayName: body.tenantDisplayName,
      ownerUserId: user.userId,
    });

    return json({ ok: true, user, tenant });
  }

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    const body = await req.json() as {
      email: string;
      password: string;
      tenantId?: string;
    };

    const session = auth.login(body);
    if (!session) return json({ error: 'invalid_credentials' }, 401);

    return json(
      { ok: true, sessionId: session.sessionId, userId: session.userId },
      200,
      {
        'set-cookie': `autoorg_session=${session.token}; HttpOnly; Path=/; SameSite=Lax`,
      }
    );
  }

  if (url.pathname === '/api/auth/api-keys' && method === 'POST') {
    const body = await req.json() as {
      tenantId: string;
      userId?: string;
      keyName: string;
      scopes: string[];
      expiresAt?: string;
    };

    const key = auth.createApiKey(body);
    return json({ ok: true, key });
  }

  return null;
}
22. Billing routes