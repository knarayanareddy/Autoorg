TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class CommentService {
  create(opts: {
    tenantId: string;
    workspaceId?: string;
    userId?: string;
    parentCommentId?: string;
    subjectKind: 'hosted_run' | 'approval' | 'artifact' | 'portfolio_run' | 'benchmark_run';
    subjectRef: string;
    body: string;
    mentions?: string[];
  }) {
    const db = getDb();
    const id = `cmt_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO comments
      (id, tenant_id, workspace_id, user_id, parent_comment_id, subject_kind, subject_ref, body, mentions_json, resolved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      opts.tenantId,
      opts.workspaceId ?? null,
      opts.userId ?? null,
      opts.parentCommentId ?? null,
      opts.subjectKind,
      opts.subjectRef,
      opts.body,
      JSON.stringify(opts.mentions ?? [])
    );

    db.close();
    return { commentId: id };
  }

  list(subjectKind: string, subjectRef: string) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM comments
      WHERE subject_kind = ? AND subject_ref = ?
      ORDER BY created_at ASC
    `).all(subjectKind, subjectRef);
    db.close();
    return rows;
  }

  resolve(commentId: string) {
    const db = getDb();
    db.prepare(`
      UPDATE comments
      SET resolved = 1
      WHERE id = ?
    `).run(commentId);
    db.close();
  }
}
11. Template curator prompt