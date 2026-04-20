TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class Lineage {
  link(opts: {
    entityKind: string;
    entityId: string;
    parentEntityKind?: string;
    parentEntityId?: string;
    relation: string;
    metadata?: Record<string, unknown>;
  }) {
    const db = getDb();
    db.prepare(`
      INSERT INTO learning_lineage
      (id, entity_kind, entity_id, parent_entity_kind, parent_entity_id, relation, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `lin_${nanoid(10)}`,
      opts.entityKind,
      opts.entityId,
      opts.parentEntityKind ?? null,
      opts.parentEntityId ?? null,
      opts.relation,
      JSON.stringify(opts.metadata ?? {})
    );
    db.close();
  }

  ancestors(entityKind: string, entityId: string) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM learning_lineage
      WHERE entity_kind = ? AND entity_id = ?
      ORDER BY created_at DESC
    `).all(entityKind, entityId);
    db.close();
    return rows;
  }
}
4. Pattern extractor prompt