TypeScript

import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ArtifactSigner } from '@/runtime/artifact-signing.js';

export class ImmutableArtifacts {
  private signer = new ArtifactSigner();

  async writeText(opts: {
    runId: string;
    relPath: string;
    text: string;
    artifactKind: string;
    mimeType?: string;
    actionId?: string;
  }) {
    const abs = path.join(process.cwd(), opts.relPath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, opts.text, 'utf-8');

    // best-effort immutability on local disk
    await chmod(abs, 0o444).catch(() => {});

    const manifest = await this.signer.signFile({
      runId: opts.runId,
      artifactPath: abs,
      artifactKind: opts.artifactKind,
      mimeType: opts.mimeType ?? 'text/plain',
      actionId: opts.actionId,
    });

    return { artifactPath: abs, ...manifest };
  }

  async writeJson(opts: {
    runId: string;
    relPath: string;
    data: unknown;
    artifactKind: string;
    actionId?: string;
  }) {
    return this.writeText({
      runId: opts.runId,
      relPath: opts.relPath,
      text: JSON.stringify(opts.data, null, 2),
      artifactKind: opts.artifactKind,
      mimeType: 'application/json',
      actionId: opts.actionId,
    });
  }
}
6. Run manifest at boot