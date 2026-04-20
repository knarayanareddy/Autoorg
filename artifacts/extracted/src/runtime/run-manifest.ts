TypeScript

import simpleGit from 'simple-git';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { ImmutableArtifacts } from '@/runtime/immutable-artifacts.js';
import { ArtifactSigner } from '@/runtime/artifact-signing.js';

export class RunManifestWriter {
  private git = simpleGit();
  private artifacts = new ImmutableArtifacts();
  private signer = new ArtifactSigner();

  async write(runId: string, payload: Record<string, unknown>) {
    const gitHead = (await this.git.revparse(['HEAD'])).trim().catch(() => '');
    const manifest = {
      runId,
      gitHead,
      createdAt: new Date().toISOString(),
      payload,
    };

    const relPath = `artifacts/manifests/run_${runId}.json`;
    const { artifactPath } = await this.artifacts.writeJson({
      runId,
      relPath,
      data: manifest,
      artifactKind: 'run_manifest',
    });

    const signed = this.signer.signObject(manifest);

    const db = getDb();
    db.prepare(`
      INSERT INTO run_manifests
      (id, run_id, artifact_path, git_head, manifest_sha256, signature, signer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `rm_${nanoid(10)}`,
      runId,
      artifactPath,
      gitHead,
      signed.sha256,
      signed.signature,
      process.env.AUTOORG_INSTANCE_NAME ?? 'default-instance',
    );
    db.close();

    return { artifactPath, gitHead };
  }
}
7. Redaction filters