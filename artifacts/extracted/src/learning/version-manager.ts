TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { Lineage } from '@/learning/lineage.js';

export class VersionManager {
  private lineage = new Lineage();

  getActivePrompt(targetKey: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM prompt_versions
      WHERE target_key = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(targetKey) as any;
    db.close();
    return row ?? null;
  }

  createPromptCandidate(opts: {
    targetKey: string;
    content: string;
    proposalId?: string;
    notes?: Record<string, unknown>;
  }) {
    const db = getDb();
    const parent = db.prepare(`
      SELECT id, version_label
      FROM prompt_versions
      WHERE target_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(opts.targetKey) as { id: string; version_label: string } | undefined;

    const id = `pv_${nanoid(10)}`;
    const versionLabel = parent ? `${parent.version_label}.next` : 'v1.candidate';

    db.prepare(`
      INSERT INTO prompt_versions
      (id, target_key, version_label, parent_version_id, status, content, created_by_proposal_id, notes_json)
      VALUES (?, ?, ?, ?, 'candidate', ?, ?, ?)
    `).run(
      id,
      opts.targetKey,
      versionLabel,
      parent?.id ?? null,
      opts.content,
      opts.proposalId ?? null,
      JSON.stringify(opts.notes ?? {})
    );
    db.close();

    if (parent) {
      this.lineage.link({
        entityKind: 'prompt_version',
        entityId: id,
        parentEntityKind: 'prompt_version',
        parentEntityId: parent.id,
        relation: 'derived_from',
      });
    }

    return { versionId: id };
  }

  activatePrompt(versionId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT target_key FROM prompt_versions WHERE id = ?
    `).get(versionId) as { target_key: string } | undefined;
    if (!row) {
      db.close();
      throw new Error(`Prompt version ${versionId} not found`);
    }

    db.prepare(`
      UPDATE prompt_versions
      SET status = 'retired'
      WHERE target_key = ? AND status = 'active'
    `).run(row.target_key);

    db.prepare(`
      UPDATE prompt_versions
      SET status = 'active'
      WHERE id = ?
    `).run(versionId);
    db.close();
  }

  getActiveRole(roleKey: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM role_versions
      WHERE role_key = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(roleKey) as any;
    db.close();
    return row ?? null;
  }

  createRoleCandidate(opts: {
    roleKey: string;
    manifestJson: Record<string, unknown>;
    proposalId?: string;
  }) {
    const db = getDb();
    const parent = db.prepare(`
      SELECT id, version_label
      FROM role_versions
      WHERE role_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(opts.roleKey) as { id: string; version_label: string } | undefined;

    const id = `rv_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO role_versions
      (id, role_key, version_label, parent_version_id, status, manifest_json, created_by_proposal_id)
      VALUES (?, ?, ?, ?, 'candidate', ?, ?)
    `).run(
      id,
      opts.roleKey,
      parent ? `${parent.version_label}.next` : 'v1.candidate',
      parent?.id ?? null,
      JSON.stringify(opts.manifestJson),
      opts.proposalId ?? null
    );
    db.close();

    return { versionId: id };
  }

  activateRole(versionId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT role_key FROM role_versions WHERE id = ?
    `).get(versionId) as { role_key: string } | undefined;
    if (!row) {
      db.close();
      throw new Error(`Role version ${versionId} not found`);
    }

    db.prepare(`
      UPDATE role_versions
      SET status = 'retired'
      WHERE role_key = ? AND status = 'active'
    `).run(row.role_key);

    db.prepare(`
      UPDATE role_versions
      SET status = 'active'
      WHERE id = ?
    `).run(versionId);
    db.close();
  }

  getActiveRouting() {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM routing_versions
      WHERE routing_scope = 'global' AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as any;
    db.close();
    return row ?? null;
  }

  createRoutingCandidate(opts: {
    configJson: Record<string, unknown>;
    proposalId?: string;
  }) {
    const db = getDb();
    const parent = db.prepare(`
      SELECT id, version_label
      FROM routing_versions
      WHERE routing_scope = 'global'
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as { id: string; version_label: string } | undefined;

    const id = `rtv_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO routing_versions
      (id, routing_scope, version_label, parent_version_id, status, config_json, created_by_proposal_id)
      VALUES (?, 'global', ?, ?, 'candidate', ?, ?)
    `).run(
      id,
      parent ? `${parent.version_label}.next` : 'v1.candidate',
      parent?.id ?? null,
      JSON.stringify(opts.configJson),
      opts.proposalId ?? null
    );
    db.close();

    return { versionId: id };
  }

  activateRouting(versionId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE routing_versions
      SET status = 'retired'
      WHERE routing_scope = 'global' AND status = 'active'
    `).run();

    db.prepare(`
      UPDATE routing_versions
      SET status = 'active'
      WHERE id = ?
    `).run(versionId);
    db.close();
  }

  createPolicyCandidate(opts: {
    targetKey: string;
    configJson: Record<string, unknown>;
    proposalId?: string;
  }) {
    const db = getDb();
    const parent = db.prepare(`
      SELECT id, version_label
      FROM policy_versions
      WHERE target_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(opts.targetKey) as { id: string; version_label: string } | undefined;

    const id = `plv_${nanoid(10)}`;
    db.prepare(`
      INSERT INTO policy_versions
      (id, target_key, version_label, parent_version_id, status, config_json, created_by_proposal_id)
      VALUES (?, ?, ?, ?, 'candidate', ?, ?)
    `).run(
      id,
      opts.targetKey,
      parent ? `${parent.version_label}.next` : 'v1.candidate',
      parent?.id ?? null,
      JSON.stringify(opts.configJson),
      opts.proposalId ?? null
    );
    db.close();

    return { versionId: id };
  }

  activatePolicy(versionId: string) {
    const db = getDb();
    const row = db.prepare(`
      SELECT target_key FROM policy_versions WHERE id = ?
    `).get(versionId) as { target_key: string } | undefined;
    if (!row) {
      db.close();
      throw new Error(`Policy version ${versionId} not found`);
    }

    db.prepare(`
      UPDATE policy_versions
      SET status = 'retired'
      WHERE target_key = ? AND status = 'active'
    `).run(row.target_key);

    db.prepare(`
      UPDATE policy_versions
      SET status = 'active'
      WHERE id = ?
    `).run(versionId);
    db.close();
  }
}
3. Lineage graph