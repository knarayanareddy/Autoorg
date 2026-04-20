TypeScript

import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function sha256(buf: Buffer | string) {
  return createHash('sha256').update(buf).digest('hex');
}

function signDigest(digest: string) {
  const secret = process.env.AUTOORG_SIGNING_SECRET ?? 'dev-signing-secret';
  return createHmac('sha256', secret).update(digest).digest('hex');
}

export class ArtifactSigner {
  async signFile(opts: {
    runId: string;
    artifactPath: string;
    artifactKind: string;
    mimeType?: string;
    actionId?: string;
    parentSha256?: string;
  }) {
    const buf = await readFile(opts.artifactPath);
    const digest = sha256(buf);
    const signature = signDigest(digest);

    const db = getDb();
    db.prepare(`
      INSERT INTO artifact_manifests
      (id, run_id, action_id, artifact_path, artifact_kind, mime_type, bytes, sha256, parent_sha256, signature, signer, immutable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      `am_${nanoid(10)}`,
      opts.runId,
      opts.actionId ?? null,
      opts.artifactPath,
      opts.artifactKind,
      opts.mimeType ?? 'application/octet-stream',
      buf.byteLength,
      digest,
      opts.parentSha256 ?? null,
      signature,
      process.env.AUTOORG_INSTANCE_NAME ?? 'default-instance',
    );
    db.close();

    return { sha256: digest, signature };
  }

  async verifyFile(artifactPath: string) {
    const buf = await readFile(artifactPath);
    const digest = sha256(buf);

    const db = getDb();
    const row = db.prepare(`
      SELECT sha256, signature
      FROM artifact_manifests
      WHERE artifact_path = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(artifactPath) as
      | { sha256: string; signature: string }
      | undefined;
    db.close();

    if (!row) return { ok: false, reason: 'No manifest found' };

    return {
      ok: row.sha256 === digest && row.signature === signDigest(digest),
      reason: row.sha256 === digest ? 'verified' : 'digest mismatch',
    };
  }

  signObject(obj: unknown) {
    const text = JSON.stringify(obj, null, 2);
    const digest = sha256(text);
    return {
      sha256: digest,
      signature: signDigest(digest),
    };
  }
}