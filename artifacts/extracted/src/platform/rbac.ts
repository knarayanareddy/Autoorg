TypeScript

import { getDb } from '@/db/migrate.js';

const TENANT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: [
    'tenant.read', 'workspace.create', 'workspace.read', 'workspace.update',
    'run.create', 'run.read', 'run.cancel',
    'approval.act', 'comment.create', 'billing.read', 'template.publish'
  ],
  editor: [
    'workspace.read', 'run.create', 'run.read', 'approval.read',
    'comment.create', 'template.read'
  ],
  reviewer: [
    'workspace.read', 'run.read', 'approval.read', 'approval.act', 'comment.create'
  ],
  viewer: [
    'workspace.read', 'run.read', 'approval.read', 'template.read'
  ],
  billing: [
    'billing.read', 'workspace.read'
  ],
};

const WORKSPACE_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['workspace.read', 'workspace.update', 'run.create', 'run.read', 'run.cancel', 'approval.act', 'comment.create'],
  editor: ['workspace.read', 'run.create', 'run.read', 'comment.create'],
  reviewer: ['workspace.read', 'run.read', 'approval.read', 'approval.act', 'comment.create'],
  viewer: ['workspace.read', 'run.read'],
  runner: ['workspace.read', 'run.read', 'run.create'],
};

export class RbacService {
  hasPermission(opts: {
    tenantId: string;
    userId?: string;
    apiKeyId?: string;
    workspaceId?: string;
    permission: string;
  }) {
    const db = getDb();

    if (opts.userId) {
      const tenantRole = db.prepare(`
        SELECT role_key FROM memberships
        WHERE tenant_id = ? AND user_id = ? AND status = 'active'
        LIMIT 1
      `).get(opts.tenantId, opts.userId) as { role_key: string } | undefined;

      const workspaceRole = opts.workspaceId
        ? db.prepare(`
            SELECT role_key FROM workspace_memberships
            WHERE workspace_id = ? AND user_id = ?
            LIMIT 1
          `).get(opts.workspaceId, opts.userId) as { role_key: string } | undefined
        : undefined;

      const tenantPerms = tenantRole ? TENANT_ROLE_PERMISSIONS[tenantRole.role_key] ?? [] : [];
      const workspacePerms = workspaceRole ? WORKSPACE_ROLE_PERMISSIONS[workspaceRole.role_key] ?? [] : [];

      const override = db.prepare(`
        SELECT effect
        FROM permission_overrides
        WHERE tenant_id = ?
          AND (? IS NULL OR workspace_id = ? OR workspace_id IS NULL)
          AND subject_type = 'user'
          AND subject_ref = ?
          AND permission_key = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(opts.tenantId, opts.workspaceId ?? null, opts.workspaceId ?? null, opts.userId, opts.permission) as
        | { effect: 'allow' | 'deny' }
        | undefined;

      db.close();

      if (override?.effect === 'deny') return false;
      if (override?.effect === 'allow') return true;
      if (tenantPerms.includes('*')) return true;
      return tenantPerms.includes(opts.permission) || workspacePerms.includes(opts.permission);
    }

    if (opts.apiKeyId) {
      const key = db.prepare(`
        SELECT scopes_json
        FROM api_keys
        WHERE id = ?
      `).get(opts.apiKeyId) as { scopes_json: string } | undefined;
      db.close();
      const scopes = key ? JSON.parse(key.scopes_json || '[]') : [];
      return scopes.includes('*') || scopes.includes(opts.permission);
    }

    db.close();
    return false;
  }
}
4. Tenant context