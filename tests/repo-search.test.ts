/**
 * R3 (red-team): repo.search must not return raw secrets.
 *
 * The connector pipes ripgrep output straight through: any credential in a
 * non-gitignored working file came back verbatim into agent context (proven
 * live with a planted sk-ant- key; .env is hidden only by .gitignore — luck,
 * not control). Redact hit content at the connector.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { repoSearchConnector } from '../src/integrations/connectors/repo-search.ts';

const FIXTURE_DIR = path.resolve('./test-results/repo-search-fixture');
const SECRET_ANTHROPIC = 'sk-' + 'ant-api03repoSearchfixture0123456789abcdef';
const SECRET_GITHUB = 'gh' + 'p_repoSearchfixturetoken0123456789abcdef01';
const MARKER = 'redteam-repo-search-marker';

beforeAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(
    path.join(FIXTURE_DIR, 'notes.txt'),
    [
      `${MARKER} line with anthropic ${SECRET_ANTHROPIC} inline`,
      `${MARKER} line with github ${SECRET_GITHUB} inline`,
      `${MARKER} benign line with no secrets`,
    ].join('\n'),
    'utf8'
  );
});
afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

describe('repo.search secret redaction (R3)', () => {
  it('redacts secret-shaped hit content before returning it', async () => {
    const res = await repoSearchConnector(MARKER, FIXTURE_DIR, 10);
    expect(res.lines.length).toBeGreaterThanOrEqual(3);

    const allText = res.lines.map(l => l.text).join('\n');
    expect(allText).not.toContain(SECRET_ANTHROPIC);
    expect(allText).not.toContain(SECRET_GITHUB);
    expect(allText).toContain('[REDACTED:ANTHROPIC_KEY]');
    expect(allText).toContain('[REDACTED:GITHUB_TOKEN]');
    // Benign content is untouched (redaction is not truncation).
    expect(allText).toContain('benign line with no secrets');
    // Line numbers and files still line up for the agent.
    expect(res.lines.every(l => l.file.endsWith('notes.txt') && l.line >= 1)).toBe(true);
  });

  it('still finds matches when the query itself is secret-shaped', async () => {
    // An agent searching for a key it already knows must not re-leak file content.
    const res = await repoSearchConnector(SECRET_ANTHROPIC, FIXTURE_DIR, 10);
    expect(res.lines.length).toBeGreaterThan(0);
    expect(res.summary).not.toContain(SECRET_ANTHROPIC);
    for (const l of res.lines) {
      expect(l.text).not.toContain(SECRET_ANTHROPIC);
    }
  });
});
