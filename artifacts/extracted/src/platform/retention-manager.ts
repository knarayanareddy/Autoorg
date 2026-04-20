TypeScript

import { nanoid } from 'nanoid';
import { unlink } from 'node:fs/promises';
import { getDb } from '@/db/migrate.js';

export class RetentionManager {
  async seedDefault(tenantId: string) {
    const defaults = [
      ['transcript', 30, 'archive'],
      ['tool_execution', 30, 'archive'],
      ['benchmark_report', 90, 'archive'],
      ['workspace_backup', 30, 'archive'],
      ['security_audit', 180, 'archive'],
    ] as const;

    const db = getDb();
    for (const [artifactClass, retainDays, purgeMode] of defaults) {
      db.prepare(`
        INSERT OR IGNORE INTO retention_policies
        (id, tenant_id, workspace_id, artifact_class, retain_days, purge_mode)
        VALUES (?, ?, NULL, ?, ?, ?)
      `).run(`ret_${nanoid(8)}`, tenantId, artifactClass, retainDays, purgeMode);
    }
    db.close();
  }

  async enforce() {
    const db = getDb();
    const policies = db.prepare(`SELECT * FROM retention_policies`).all() as Array<any>;

    for (const policy of policies) {
      if (policy.purge_mode !== 'delete') continue;

      const manifests = db.prepare(`
        SELECT id, artifact_path, created_at
        FROM artifact_manifests
        WHERE artifact_kind = ?
          AND created_at < datetime('now', ?)
      `).all(policy.artifact_class, `-${policy.retain_days} days`) as Array<any>;

      for (const m of manifests) {
        await unlink(m.artifact_path).catch(() => {});
        db.prepare(`
          INSERT INTO compliance_logs
          (id, tenant_id, workspace_id, actor_type, actor_ref, event_type, subject_kind, subject_ref, details_json)
          VALUES (?, ?, ?, 'system', 'retention-manager', 'retention_purge', 'artifact', ?, ?)
        `).run(
          `cl_${nanoid(10)}`,
          policy.tenant_id ?? null,
          policy.workspace_id ?? null,
          m.id,
          JSON.stringify({ artifactPath: m.artifact_path, policyId: policy.id })
        );
      }
    }

    db.close();
  }
}
16. Observability snapshots