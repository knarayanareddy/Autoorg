TypeScript

/**
 * AutoOrg Filesystem Mailbox — Inter-Agent IPC
 * 
 * Directly inspired by Claude Code's leaked Coordinator Mode:
 * "Communication happens through a filesystem-based mailbox —
 *  not shared memory, not API calls. The team lead writes a message
 *  to ~/.claude/teams/{team}/mailbox/{agent}.json, and the teammate
 *  reads it on its next loop iteration."
 *
 * Philosophy: No message broker. No WebSocket. No shared state.
 * Just files on disk. Crash-resilient. Fully auditable.
 */

import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync }                      from 'node:fs';
import path                                from 'node:path';
import { nanoid }                          from 'nanoid';
import { getDb }                           from '@/db/migrate.js';
import type { AgentTask, AgentOutput, AgentRole } from '@/types/index.js';

const MAILBOX_ROOT = process.env.AUTOORG_MAILBOX_DIR ?? './mailbox';

// ── Message envelope stored in JSON files ─────────────────────────────
export interface MailboxMessage {
  id: string;
  from: AgentRole | 'ORCHESTRATOR';
  to: AgentRole;
  type: 'task' | 'reply' | 'objection' | 'directive' | 'memory_update';
  payload: AgentTask | AgentOutput | Record<string, unknown>;
  createdAt: string;
  readAt?: string;
}

export class MailMan {
  private inboxDir:  string;
  private outboxDir: string;

  constructor(rootDir: string = MAILBOX_ROOT) {
    this.inboxDir  = path.join(rootDir, 'inbox');
    this.outboxDir = path.join(rootDir, 'outbox');
  }

  // ── Ensure directories exist ─────────────────────────────────────
  async ensureDirs(): Promise<void> {
    await mkdir(this.inboxDir,  { recursive: true });
    await mkdir(this.outboxDir, { recursive: true });
  }

  // ── Deliver a task from CEO → worker agent ───────────────────────
  async deliverTask(task: AgentTask): Promise<string> {
    await this.ensureDirs();

    const messageId = `msg_${nanoid(8)}`;
    const envelope: MailboxMessage = {
      id:        messageId,
      from:      task.from,
      to:        task.to,
      type:      'task',
      payload:   task,
      createdAt: new Date().toISOString(),
    };

    const filePath = path.join(
      this.inboxDir,
      `${task.to.toLowerCase()}_task_${task.cycleNumber}.json`
    );

    await writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf-8');

    // Persist to DB for audit trail
    this.logMessageToDb(envelope, task.runId, this.getCycleId(task.runId, task.cycleNumber));

    return messageId;
  }

  // ── Read an agent's task from inbox ─────────────────────────────
  async readTask(role: AgentRole, cycleNumber: number): Promise<AgentTask | null> {
    const filePath = path.join(
      this.inboxDir,
      `${role.toLowerCase()}_task_${cycleNumber}.json`
    );

    if (!existsSync(filePath)) return null;

    const raw      = await readFile(filePath, 'utf-8');
    const envelope = JSON.parse(raw) as MailboxMessage;

    // Mark as read
    envelope.readAt = new Date().toISOString();
    await writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf-8');

    return envelope.payload as AgentTask;
  }

  // ── Post an agent's reply to outbox ─────────────────────────────
  async postReply(output: AgentOutput): Promise<string> {
    await this.ensureDirs();

    const messageId = `msg_${nanoid(8)}`;
    const envelope: MailboxMessage = {
      id:        messageId,
      from:      output.from,
      to:        'CEO',
      type:      'reply',
      payload:   output,
      createdAt: new Date().toISOString(),
    };

    const filePath = path.join(
      this.outboxDir,
      `${output.from.toLowerCase()}_reply_${output.cycleNumber}.json`
    );

    await writeFile(filePath, JSON.stringify(envelope, null, 2), 'utf-8');

    return messageId;
  }

  // ── Read all worker replies for a cycle ──────────────────────────
  async readReplies(
    roles: AgentRole[],
    cycleNumber: number
  ): Promise<Map<AgentRole, AgentOutput>> {
    const replies = new Map<AgentRole, AgentOutput>();

    for (const role of roles) {
      const filePath = path.join(
        this.outboxDir,
        `${role.toLowerCase()}_reply_${cycleNumber}.json`
      );

      if (existsSync(filePath)) {
        const raw      = await readFile(filePath, 'utf-8');
        const envelope = JSON.parse(raw) as MailboxMessage;
        replies.set(role, envelope.payload as AgentOutput);
      }
    }

    return replies;
  }

  // ── Clean cycle mailbox (called after ratchet decision) ──────────
  async cleanCycle(cycleNumber: number): Promise<void> {
    const allRoles: AgentRole[] = [
      'CEO', 'Engineer', 'Critic', 'DevilsAdvocate',
      'Archivist', 'RatchetJudge', 'DreamAgent',
    ];

    for (const role of allRoles) {
      const inboxFile  = path.join(this.inboxDir,  `${role.toLowerCase()}_task_${cycleNumber}.json`);
      const outboxFile = path.join(this.outboxDir, `${role.toLowerCase()}_reply_${cycleNumber}.json`);

      if (existsSync(inboxFile))  await rm(inboxFile);
      if (existsSync(outboxFile)) await rm(outboxFile);
    }
  }

  // ── DB logging helper ─────────────────────────────────────────────
  private logMessageToDb(
    envelope: MailboxMessage,
    runId: string,
    cycleId: string
  ): void {
    try {
      const db = getDb();
      db.prepare(`
        INSERT OR IGNORE INTO mailbox_messages
          (id, run_id, cycle_id, from_agent, to_agent, message_type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        envelope.id,
        runId,
        cycleId,
        envelope.from,
        envelope.to,
        envelope.type,
        JSON.stringify(envelope.payload),
        envelope.createdAt
      );
      db.close();
    } catch {
      // Non-fatal — mailbox files are the source of truth
    }
  }

  private getCycleId(runId: string, cycleNumber: number): string {
    try {
      const db  = getDb();
      const row = db.prepare(
        `SELECT id FROM cycles WHERE run_id = ? AND cycle_number = ?`
      ).get(runId, cycleNumber) as { id: string } | undefined;
      db.close();
      return row?.id ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Singleton instance
export const mailman = new MailMan();