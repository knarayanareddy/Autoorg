TypeScript

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class WorkspaceProvisioner {
  async create(opts: {
    tenantId: string;
    slug: string;
    displayName: string;
    repoUrl?: string;
    defaultBranch?: string;
    isolationMode?: 'directory' | 'git_worktree' | 'container';
  }) {
    const id = `ws_${nanoid(10)}`;
    const rootPath = path.join(process.cwd(), 'tenants', opts.tenantId, 'workspaces', opts.slug);

    await mkdir(rootPath, { recursive: true });
    await mkdir(path.join(rootPath, 'memory'), { recursive: true });
    await mkdir(path.join(rootPath, 'workspace'), { recursive: true });
    await mkdir(path.join(rootPath, 'artifacts'), { recursive: true });

    const db = getDb();
    db.prepare(`
      INSERT INTO workspaces
      (id, tenant_id, slug, display_name, root_path, repo_url, default_branch, isolation_mode, status, settings_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', '{}')
    `).run(
      id,
      opts.tenantId,
      opts.slug,
      opts.displayName,
      rootPath,
      opts.repoUrl ?? null,
      opts.defaultBranch ?? 'main',
      opts.isolationMode ?? 'directory'
    );
    db.close();

    return {
      workspaceId: id,
      rootPath,
    };
  }
}
6. Quota manager