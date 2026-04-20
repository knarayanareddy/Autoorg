TypeScript

import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/db/migrate.js';

export class RoleRegistry {
  async seedFromDisk(root = path.join(process.cwd(), 'platform', 'roles')) {
    const files = ['engineer.json', 'critic.json', 'archivist.json', 'coordinator.json'];

    for (const file of files) {
      const manifest = JSON.parse(await readFile(path.join(root, file), 'utf-8'));
      const db = getDb();
      db.prepare(`
        INSERT OR IGNORE INTO role_registry
        (id, tenant_id, role_key, display_name, role_manifest_json, visibility, version)
        VALUES (?, NULL, ?, ?, ?, 'public', ?)
      `).run(
        `rol_${nanoid(10)}`,
        manifest.role_key,
        manifest.display_name,
        JSON.stringify(manifest),
        manifest.version ?? '1.0.0'
      );
      db.close();
    }
  }

  list(tenantId?: string) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM role_registry
      WHERE visibility = 'public'
         OR (visibility IN ('tenant','private') AND tenant_id = ?)
      ORDER BY created_at DESC
    `).all(tenantId ?? null);
    db.close();
    return rows;
  }
}
14. Backup manager