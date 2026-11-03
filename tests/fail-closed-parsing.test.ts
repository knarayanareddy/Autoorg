/**
 * Fail-closed structured parsing — OWASP A04 (lenient parse = happy default).
 *
 * `parseStructuredOutputLenient(text, schema, fallback)` swallowed parse
 * errors and returned fabricated content (fake critic objections, default
 * CEO assignments, invented advocate positions) that then flowed into the
 * ratchet decision. The contract now is:
 *
 *   - the lenient parser no longer exists anywhere (unit + source scan), and
 *   - the strict parser throws `StructuredOutputError` on malformed output,
 *     which propagates to the orchestrator's cycle catch (git reset + error
 *     cycle) instead of substituting a happy default.
 */

import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import * as structuredOutput from '../src/utils/structured-output.ts';
import {
  parseStructuredOutput,
  StructuredOutputError,
} from '../src/utils/structured-output.ts';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('structured-output module', () => {
  it('does not export a lenient (fail-open) parser anymore', () => {
    expect((structuredOutput as Record<string, unknown>).parseStructuredOutputLenient)
      .toBeUndefined();
  });

  it('strict parser throws StructuredOutputError on garbage', () => {
    const schema = z.object({ decision: z.string() });
    expect(() => parseStructuredOutput('not json at all', schema))
      .toThrow(StructuredOutputError);
  });

  it('strict parser throws when JSON exists but does not match the schema', () => {
    const schema = z.object({ decision: z.enum(['COMMIT', 'REVERT']) });
    expect(() => parseStructuredOutput('{"decision":"SHIP IT"}', schema))
      .toThrow(StructuredOutputError);
  });
});

describe('no fail-open call sites remain in src/', () => {
  it('never references parseStructuredOutputLenient', () => {
    const offenders = sourceFiles(path.join(process.cwd(), 'src'))
      .filter(file => readFileSync(file, 'utf-8').includes('parseStructuredOutputLenient'))
      .map(file => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
