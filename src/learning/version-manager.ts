import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface VersionInfo {
  id: string;
  target_key: string;
  version_label: string;
  content: string;
  status: 'candidate' | 'active' | 'retired' | 'rejected';
}

export class VersionManager {
  /**
   * Retrieves the current active prompt/config for a given key.
   * If no versioned entry exists, returns null (caller should fall back to file-based default).
   */
  async getActive(targetKey: string): Promise<VersionInfo | null> {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM prompt_versions 
      WHERE target_key = ? AND status = 'active'
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(targetKey) as VersionInfo | undefined;
    db.close();
    return row ?? null;
  }

  /**
   * Creates a new candidate version for a target.
   */
  async createCandidate(opts: {
    targetKey: string;
    versionLabel: string;
    content: string;
    proposalId?: string;
    parentId?: string;
  }): Promise<string> {
    const db = getDb();
    const id = `pv_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO prompt_versions (id, target_key, version_label, status, content, proposal_id, parent_version_id)
      VALUES (?, ?, ?, 'candidate', ?, ?, ?)
    `).run(id, opts.targetKey, opts.versionLabel, opts.content, opts.proposalId ?? null, opts.parentId ?? null);

    db.close();
    return id;
  }

  /**
   * Activates a specific version and retires the previous active one.
   */
  async activate(versionId: string) {
    const db = getDb();
    const version = db.prepare(`SELECT target_key FROM prompt_versions WHERE id = ?`).get(versionId) as { target_key: string };
    
    if (!version) {
      db.close();
      throw new Error(`Version ${versionId} not found`);
    }

    // Retire old active
    db.prepare(`
      UPDATE prompt_versions 
      SET status = 'retired' 
      WHERE target_key = ? AND status = 'active'
    `).run(version.target_key);

    // Activate new
    db.prepare(`
      UPDATE prompt_versions SET status = 'active' WHERE id = ?
    `).run(versionId);

    db.close();
  }
}
