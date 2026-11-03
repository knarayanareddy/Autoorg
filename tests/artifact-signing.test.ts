/**
 * Artifact signing tests — OWASP A08 (forgeable artifact signatures).
 *
 * The signer used to fall back to the literal `'internal-default-secret'` when
 * `AUTOORG_SIGNING_SECRET` was unset, so anyone who read the source could
 * forge a valid signature for any artifact. A missing or empty key must be a
 * hard failure instead: at signing time (throws) and at process startup
 * (`assertSigningConfigured()` refuses to boot).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArtifactSigner, assertSigningConfigured } from '../src/runtime/artifact-signing.ts';
import { ImmutableArtifacts } from '../src/runtime/immutable-artifacts.ts';
import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

const RUN_ID = testRunId('artifact-signing');
const signer = new ArtifactSigner();

let dir: string;
let savedSecret: string | undefined;

beforeAll(async () => {
  await useTestDb('autoorg-signing-');
  dir = await mkdtemp(path.join(tmpdir(), 'autoorg-signing-files-'));
});

afterAll(async () => {
  cleanupTestDb();
  await rm(dir, { recursive: true, force: true });
  await rm(path.join(process.cwd(), 'test-results', 'artifact-signing-tmp'), { recursive: true, force: true });
});

beforeEach(() => {
  savedSecret = process.env.AUTOORG_SIGNING_SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.AUTOORG_SIGNING_SECRET;
  else process.env.AUTOORG_SIGNING_SECRET = savedSecret;
});

async function writeArtifact(name: string, content: string): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, content, 'utf-8');
  return file;
}

describe('ArtifactSigner (A08 — forgeable signatures)', () => {
  it('round-trips a signed file when a key is configured', async () => {
    process.env.AUTOORG_SIGNING_SECRET = 'test-secret-1';
    const file = await writeArtifact('artifact-1.md', 'hello artifact');
    const signed = await signer.signFile({
      runId: RUN_ID,
      artifactPath: file,
      artifactKind: 'report',
    });
    expect(signed.sha256).toHaveLength(64);
    expect(signed.signature).toBeTruthy();

    const verdict = await signer.verifyFile(file);
    expect(verdict.ok).toBe(true);
  });

  it('detects a tampered artifact', async () => {
    process.env.AUTOORG_SIGNING_SECRET = 'test-secret-1';
    const file = await writeArtifact('artifact-2.md', 'original content');
    await signer.signFile({ runId: RUN_ID, artifactPath: file, artifactKind: 'report' });

    await writeFile(file, 'tampered content', 'utf-8');
    const verdict = await signer.verifyFile(file);
    expect(verdict.ok).toBe(false);
  });

  it('does not verify a signature made with a different key', async () => {
    process.env.AUTOORG_SIGNING_SECRET = 'key-A';
    const file = await writeArtifact('artifact-3.md', 'signed with key A');
    await signer.signFile({ runId: RUN_ID, artifactPath: file, artifactKind: 'report' });

    process.env.AUTOORG_SIGNING_SECRET = 'key-B';
    const verdict = await signer.verifyFile(file);
    expect(verdict.ok).toBe(false);
  });

  it('fails closed when AUTOORG_SIGNING_SECRET is missing (no default-secret fallback)', async () => {
    delete process.env.AUTOORG_SIGNING_SECRET;
    const file = await writeArtifact('artifact-4.md', 'unsigned run');

    await expect(
      signer.signFile({ runId: RUN_ID, artifactPath: file, artifactKind: 'report' })
    ).rejects.toThrow(/AUTOORG_SIGNING_SECRET/);

    expect(() => signer.signObject({ forged: true })).toThrow(/AUTOORG_SIGNING_SECRET/);
  });

  it('fails closed when AUTOORG_SIGNING_SECRET is empty', () => {
    process.env.AUTOORG_SIGNING_SECRET = '';
    expect(() => signer.signObject({ forged: true })).toThrow(/AUTOORG_SIGNING_SECRET/);
  });

  it('never signs anything while the key is unset — not even the historical literal', () => {
    delete process.env.AUTOORG_SIGNING_SECRET;
    expect(() => signer.signObject({ forged: true })).toThrow();
  });

  it('ImmutableArtifacts.writeText refuses to produce unsigned artifacts', async () => {
    delete process.env.AUTOORG_SIGNING_SECRET;
    const artifacts = new ImmutableArtifacts();
    await expect(
      artifacts.writeText({
        runId: RUN_ID,
        relPath: 'test-results/artifact-signing-tmp/report.md',
        text: 'content',
        artifactKind: 'report',
      })
    ).rejects.toThrow(/AUTOORG_SIGNING_SECRET/);
  });

  it('assertSigningConfigured refuses startup without a usable key', () => {
    delete process.env.AUTOORG_SIGNING_SECRET;
    expect(() => assertSigningConfigured()).toThrow(/AUTOORG_SIGNING_SECRET/);

    process.env.AUTOORG_SIGNING_SECRET = '';
    expect(() => assertSigningConfigured()).toThrow(/AUTOORG_SIGNING_SECRET/);

    process.env.AUTOORG_SIGNING_SECRET = 'a-real-key';
    expect(() => assertSigningConfigured()).not.toThrow();
  });
});
