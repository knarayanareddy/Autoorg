TypeScript

import { AuthService } from '@/platform/auth.js';
import { RbacService } from '@/platform/rbac.js';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  workspaceId?: string;
}

export class TenantContextResolver {
  private auth = new AuthService();
  private rbac = new RbacService();

  async fromRequest(req: Request): Promise<TenantContext | null> {
    const authHeader = req.headers.get('authorization') ?? '';
    const sessionCookie = req.headers.get('cookie') ?? '';

    if (authHeader.startsWith('Bearer ')) {
      const raw = authHeader.slice('Bearer '.length).trim();
      const apiKey = this.auth.verifyApiKey(raw);
      if (apiKey) {
        return {
          tenantId: apiKey.tenant_id,
          apiKeyId: apiKey.id,
        };
      }

      const session = this.auth.verifySession(raw);
      if (session) {
        return {
          tenantId: session.tenant_id,
          userId: session.user_id,
        };
      }
    }

    const cookieToken = sessionCookie
      .split(';')
      .map(x => x.trim())
      .find(x => x.startsWith('autoorg_session='))
      ?.split('=')[1];

    if (cookieToken) {
      const session = this.auth.verifySession(cookieToken);
      if (session) {
        return {
          tenantId: session.tenant_id,
          userId: session.user_id,
        };
      }
    }

    return null;
  }

  requirePermission(ctx: TenantContext, permission: string, workspaceId?: string) {
    const ok = this.rbac.hasPermission({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      apiKeyId: ctx.apiKeyId,
      workspaceId,
      permission,
    });

    if (!ok) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }
}
5. Workspace provisioner