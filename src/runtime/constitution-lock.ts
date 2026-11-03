import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

export class ConstitutionChangedError extends Error {
  constructor() { super('Constitution changed, disappeared, or is not a regular file; stopping run'); }
}

function digest(file: string): string {
  try {
    if (!lstatSync(file).isFile()) throw new Error('not regular');
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch { throw new ConstitutionChangedError(); }
}

/** Captures the operator's constitution at run start, without modifying it. */
export class ConstitutionGuard {
  private readonly file: string;
  private readonly baseline: string;
  constructor(root = process.cwd()) {
    this.file = path.join(root, 'constitution.md');
    this.baseline = digest(this.file);
  }
  assertUnchanged(): void {
    if (digest(this.file) !== this.baseline) throw new ConstitutionChangedError();
  }
}

/** Our shell sandbox is not an OS write barrier. Fail closed while locked. */
export function assertConstitutionSafeTool(name: string): void {
  if (name !== 'repo.search' && name !== 'web.fetch') {
    throw new Error(`Tool ${name} blocked by constitution lock: write-capable tools require OS isolation`);
  }
}
