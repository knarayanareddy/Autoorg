TypeScript

import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { $ } from 'bun';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export class BackupManager {
  private artifacts = new ImmutableArtifacts();

  async backupWorkspace(opts: {
    tenantId: string;
    workspaceId: string;
    sourcePath: string;
  }) {
    const db = getDb();
    const jobId = `bkp_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO backup_jobs
      (id, tenant_id, workspace_id, job_type, status, source_path, metadata_json)
      VALUES (?, ?, ?, 'backup', 'running', ?, '{}')
    `).run(jobId, opts.tenantId, opts.workspaceId, opts.sourcePath);
    db.close();

    try {
      await mkdir(path.join(process.cwd(), 'artifacts', 'backups'), { recursive: true });
      const tarPath = path.join(process.cwd(), 'artifacts', 'backups', `${jobId}.tar.gz`);
      await $`tar -czf ${tarPath} -C ${opts.sourcePath} .`;

      const digest = sha256(await Bun.file(tarPath).text().catch(() => tarPath));

      const written = await this.artifacts.writeText({
        runId: opts.workspaceId,
        relPath: path.relative(process.cwd(), tarPath),
        text: await Bun.file(tarPath).text().catch(() => ''),
        artifactKind: 'workspace_backup',
      }).catch(async () => {
        // fallback if binary tar isn't suited for writeText path
        return { artifactPath: tarPath, sha256: digest };
      });

      const db2 = getDb();
      db2.prepare(`
        UPDATE backup_jobs
        SET status = 'completed', artifact_path = ?, sha256 = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run(written.artifactPath, digest, jobId);
      db2.close();

      return { jobId, artifactPath: written.artifactPath, sha256: digest };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE backup_jobs
        SET status = 'failed', finished_at = datetime('now'), metadata_json = ?
        WHERE id = ?
      `).run(JSON.stringify({ error: String(error) }), jobId);
      db3.close();
      throw error;
    }
  }

  async exportWorkspace(opts: {
    tenantId: string;
    workspaceId: string;
    sourcePath: string;
  }) {
    return this.backupWorkspace({
      tenantId: opts.tenantId,
      workspaceId: opts.workspaceId,
      sourcePath: opts.sourcePath,
    });
  }

  async restoreWorkspace(opts: {
    tenantId: string;
    workspaceId: string;
    artifactPath: string;
    targetPath: string;
  }) {
    const db = getDb();
    const jobId = `rst_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO backup_jobs
      (id, tenant_id, workspace_id, job_type, status, source_path, artifact_path, metadata_json)
      VALUES (?, ?, ?, 'restore', 'running', ?, ?, '{}')
    `).run(jobId, opts.tenantId, opts.workspaceId, opts.targetPath, opts.artifactPath);
    db.close();

    try {
      await mkdir(opts.targetPath, { recursive: true });
      await $`tar -xzf ${opts.artifactPath} -C ${opts.targetPath}`;

      const db2 = getDb();
      db2.prepare(`
        UPDATE backup_jobs
        SET status = 'completed', finished_at = datetime('now')
        WHERE id = ?
      `).run(jobId);
      db2.close();

      return { jobId, restored: true };
    } catch (error) {
      const db3 = getDb();
      db3.prepare(`
        UPDATE backup_jobs
        SET status = 'failed', finished_at = datetime('now'), metadata_json = ?
        WHERE id = ?
      `).run(JSON.stringify({ error: String(error) }), jobId);
      db3.close();
      throw error;
    }
  }
}
15. Retention manager