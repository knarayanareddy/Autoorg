import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class Lineage {
  async link(opts: {
    entityKind: string;
    entityId: string;
    parentId?: string;
    relation: string;
  }) {
    const db = getDb();
    const id = `lin_${nanoid(10)}`;
    
    db.prepare(`
      INSERT INTO learning_lineage (id, entity_kind, entity_id, parent_entity_id, relation)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, opts.entityKind, opts.entityId, opts.parentId ?? null, opts.relation);
    
    db.close();
    return id;
  }

  async getAncestry(entityId: string) {
    const db = getDb();
    const rows = db.prepare(`
      WITH RECURSIVE ancestry(id, parent_id, depth) AS (
        SELECT entity_id, parent_entity_id, 0 FROM learning_lineage WHERE entity_id = ?
        UNION ALL
        SELECT l.entity_id, l.parent_entity_id, a.depth + 1
        FROM learning_lineage l
        JOIN ancestry a ON l.entity_id = a.parent_id
      )
      SELECT * FROM ancestry
    `).all(entityId);
    db.close();
    return rows;
  }
}
