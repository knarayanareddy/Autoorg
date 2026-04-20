import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface ApprovalRequest {
  runId: string;
  cycleNumber?: number;
  approvalType: 'commit' | 'push' | 'merge' | 'ultraplan' | 'daemon_action' | 'job';
  subject: string;
  requestedBy: string;
  summary: string;
  details?: Record<string, unknown>;
}

export class ApprovalGate {
  request(req: ApprovalRequest): string {
    const id = `ap_${nanoid(8)}`;
    const db = getDb();
    db.prepare(`
      INSERT INTO approvals
        (id, run_id, cycle_number, approval_type, subject, requested_by, status, summary, details_json)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      req.runId,
      req.cycleNumber ?? null,
      req.approvalType,
      req.subject,
      req.requestedBy,
      req.summary,
      JSON.stringify(req.details ?? {})
    );
    db.close();
    return id;
  }

  approve(id: string, decidedBy: string = 'human') {
    const db = getDb();
    db.prepare(`
      UPDATE approvals
      SET status='approved', decided_at=datetime('now'), decided_by=?
      WHERE id=?
    `).run(decidedBy, id);
    db.close();
  }

  reject(id: string, decidedBy: string = 'human') {
    const db = getDb();
    db.prepare(`
      UPDATE approvals
      SET status='rejected', decided_at=datetime('now'), decided_by=?
      WHERE id=?
    `).run(decidedBy, id);
    db.close();
  }

  isApproved(id: string): boolean {
    const db = getDb();
    const row = db.prepare(`
      SELECT status FROM approvals WHERE id=?
    `).get(id) as { status: string } | undefined;
    db.close();
    return row?.status === 'approved';
  }

  getPending(runId?: string) {
    const db = getDb();
    const rows = runId
      ? db.prepare(`SELECT * FROM approvals WHERE run_id=? AND status='pending' ORDER BY requested_at DESC`).all(runId)
      : db.prepare(`SELECT * FROM approvals WHERE status='pending' ORDER BY requested_at DESC`).all() as any[];
    db.close();
    return rows;
  }
}
