import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MailMan } from '../src/runtime/mailman.js';
import { rmSync, mkdirSync } from 'node:fs';
import type { AgentTask, AgentOutput } from '../src/types/index.js';

const TEST_MAILBOX = '/tmp/autoorg-test-mailbox';

describe('MailMan (Filesystem IPC)', () => {
  const mail = new MailMan(TEST_MAILBOX);

  beforeAll(async () => {
    mkdirSync(TEST_MAILBOX, { recursive: true });
    await mail.ensureDirs();
  });

  afterAll(() => {
    rmSync(TEST_MAILBOX, { recursive: true, force: true });
  });

  const testTask: AgentTask = {
    from:         'CEO',
    to:           'Engineer',
    cycleNumber:  1,
    runId:        'run_test123',
    instruction:  'Write section 1 of the research paper',
    contextRefs:  ['./memory/MEMORY.md'],
    timestamp:    new Date().toISOString(),
  };

  it('delivers a task to inbox', async () => {
    const msgId = await mail.deliverTask(testTask);
    expect(msgId).toMatch(/^msg_/);
  });

  it('reads the delivered task', async () => {
    const task = await mail.readTask('Engineer', 1);
    expect(task).not.toBeNull();
    expect(task?.instruction).toBe('Write section 1 of the research paper');
    expect(task?.from).toBe('CEO');
  });

  it('posts a reply to outbox', async () => {
    const reply: AgentOutput = {
      from:        'Engineer',
      cycleNumber: 1,
      runId:       'run_test123',
      content:     'Here is section 1...',
      tokensUsed:  500,
      costUsd:     0.001,
      durationMs:  1200,
      timestamp:   new Date().toISOString(),
    };
    const msgId = await mail.postReply(reply);
    expect(msgId).toMatch(/^msg_/);
  });

  it('reads replies for a cycle', async () => {
    const replies = await mail.readReplies(['Engineer'], 1);
    expect(replies.has('Engineer')).toBe(true);
    expect(replies.get('Engineer')?.content).toBe('Here is section 1...');
  });

  it('cleans cycle mailbox', async () => {
    await mail.cleanCycle(1);
    const task = await mail.readTask('Engineer', 1);
    expect(task).toBeNull();
  });
});
