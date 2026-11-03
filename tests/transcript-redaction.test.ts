/**
 * R2 (red-team): transcript sink redaction.
 *
 * logAgentPrompt/logAgentResponse used to write raw prompts and responses to
 * memory/transcripts/*.jsonl BEFORE the RedactionFilter ran, so any credential
 * in LLM traffic was persisted in cleartext — searchable by the Archivist and
 * DreamAgent. Redaction must happen at the sink, covering every log action.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { readFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('transcript');
const MEMORY_DIR = path.resolve('./test-results/transcript-redaction');
const previousMemoryDir = process.env.AUTOORG_MEMORY_DIR;

const SECRET_ANTHROPIC = 'sk-' + 'ant-api03-redteamfixturekey0123456789abcdef';
const SECRET_GITHUB = 'gh' + 'p_redteamfixturetoken0123456789abcdef0123';
const SECRET_EMAIL = 'leaky.person@example.com';

beforeAll(async () => {
  await useTestDb('autoorg-transcript-');
  process.env.AUTOORG_MEMORY_DIR = MEMORY_DIR;
  // The sink APPENDS: start from a clean dir so a pre-fix run's raw lines
  // can never satisfy (or poison) this run's assertions.
  await rm(path.join(MEMORY_DIR, 'transcripts'), { recursive: true, force: true });
  await mkdir(path.join(MEMORY_DIR, 'transcripts'), { recursive: true });
});
afterAll(async () => {
  cleanupTestDb();
  if (previousMemoryDir === undefined) delete process.env.AUTOORG_MEMORY_DIR;
  else process.env.AUTOORG_MEMORY_DIR = previousMemoryDir;
  await rm(MEMORY_DIR, { recursive: true, force: true });
});

describe('transcript logger sink redaction (R2)', () => {
  it('never writes raw secrets to transcripts', async () => {
    const { TranscriptLogger } = await import('../src/runtime/transcript-logger.ts');
    const logger = new TranscriptLogger();
    logger.init(RUN_ID);

    await logger.logAgentPrompt(
      'Researcher', 1,
      `system context with ${SECRET_ANTHROPIC} inline`,
      `user message with ${SECRET_GITHUB} inline`
    );
    await logger.logAgentResponse(
      'Researcher', 1,
      `response containing ${SECRET_ANTHROPIC} and ${SECRET_EMAIL}`,
      10, 0.01
    );
    await logger.logOrchestrator(1, 'note', `orchestrator detail ${SECRET_GITHUB}`);
    await logger.logAgentPrompt('Researcher', 2, 'x'.repeat(485) + ' ' + SECRET_ANTHROPIC, 'safe');
    await logger.log({ role: 'ORCHESTRATOR', cycle: 1, action: 'test', content: 'safe', metadata: { nested: [SECRET_GITHUB] } });
    await logger.logRatchetScore(1, 0.5, 'REVERT', { test: 1 });

    const file = path.join(MEMORY_DIR, 'transcripts', 'cycle_0001.jsonl');
    const raw = await readFile(file, 'utf8');

    // The security assertion: no raw secret survives to disk.
    expect(raw).not.toContain(SECRET_ANTHROPIC);
    const boundary = await readFile(path.join(MEMORY_DIR, 'transcripts', 'cycle_0002.jsonl'), 'utf8');
    expect(boundary).not.toContain(SECRET_ANTHROPIC.slice(0, 14));
    expect(raw).not.toContain(SECRET_GITHUB);
    expect(raw).not.toContain(SECRET_EMAIL);
    // Redaction markers prove the filter ran (not that content was dropped).
    expect(raw).toContain('[REDACTED:ANTHROPIC_KEY]');
    expect(raw).toContain('[REDACTED:GITHUB_TOKEN]');
    // Non-secret entries still log normally.
    expect(raw).toContain('REVERT score=0.5000');
  });
});
