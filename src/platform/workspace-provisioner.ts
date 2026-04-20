import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { GitWorktreeProvider } from './providers/git.js';
import { DockerProvider } from './providers/docker.js';

export class WorkspaceProvisioner {
  private git = new GitWorktreeProvider();
  private docker = new DockerProvider();

  async create(opts: {
    tenantId: string;
    slug: string;
    displayName: string;
    repoUrl?: string;
    isolationMode: 'git' | 'docker';
  }) {
    const id = `ws_${nanoid(10)}`;
    const db = getDb();

    // 1. Provision the filesystem
    let rootPath: string;
    if (opts.isolationMode === 'docker') {
      const res = await this.docker.provision({ workspaceId: id });
      rootPath = res.rootPath;
    } else {
      const res = await this.git.provision({ workspaceId: id, repoUrl: opts.repoUrl });
      rootPath = res.rootPath;
    }

    // 2. Register in DB
    db.prepare(`
      INSERT INTO workspaces (id, tenant_id, slug, display_name, isolation_mode, root_path, repo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, opts.tenantId, opts.slug, opts.displayName, opts.isolationMode, rootPath, opts.repoUrl ?? null);

    db.close();
    return { workspaceId: id, rootPath };
  }

  async cleanup(workspaceId: string) {
    const db = getDb();
    const ws = db.prepare(`SELECT isolation_mode FROM workspaces WHERE id = ?`).get(workspaceId) as any;
    db.close();

    if (!ws) return;

    if (ws.isolation_mode === 'docker') {
      await this.docker.cleanup(workspaceId);
    } else {
      await this.git.cleanup(workspaceId);
    }

    const db2 = getDb();
    db2.prepare(`UPDATE workspaces SET status = 'archived' WHERE id = ?`).run(workspaceId);
    db2.close();
  }
}
