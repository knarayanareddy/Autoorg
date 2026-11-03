import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

interface Detector {
  detector: string;
  type: string;
  /**
   * A FACTORY, not a shared regex instance. A module-level `/g` regex carries
   * mutable `lastIndex` state between calls, so `.test()` skips matches on
   * alternating invocations — that silently let secrets through. Always build a
   * fresh regex per call.
   */
  build: () => RegExp;
  replacement: string;
}

// Order matters: the most specific pattern must run first, otherwise
// `sk-ant-...` is swallowed by the generic OpenAI shape and mislabelled in the
// audit log.
const DETECTORS: Detector[] = [
  {
    detector: 'secret',
    type: 'anthropic_key',
    build: () => /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]',
  },
  {
    detector: 'secret',
    type: 'openai_key',
    build: () => /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[REDACTED:OPENAI_KEY]',
  },
  {
    detector: 'token',
    type: 'github_token',
    build: () => /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  {
    detector: 'token',
    type: 'slack_token',
    build: () => /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    replacement: '[REDACTED:SLACK_TOKEN]',
  },
  {
    detector: 'token',
    type: 'aws_access_key',
    build: () => /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:AWS_ACCESS_KEY]',
  },
  {
    detector: 'private_key',
    type: 'private_key_block',
    build: () => /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
    replacement: '[REDACTED:PRIVATE_KEY]',
  },
  {
    detector: 'pii',
    type: 'email',
    build: () => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED:EMAIL]',
  },
];

export interface RedactResult {
  text: string;
  redacted: boolean;
  eventCount: number;
}

export interface RedactOptions {
  cycleNumber?: number;
  channel: 'transcript' | 'memory' | 'artifact' | 'log' | 'output';
  artifactPath?: string;
}

export class RedactionFilter {
  /**
   * @param runId  Run to attribute redaction events to.
   * @param persist When false, `redact()` never touches the database. Used by
   *   `redactOnly()` and by callers that only want the cleaned text.
   */
  constructor(private runId: string, private persist: boolean = true) {}

  redact(text: string, opts: RedactOptions): RedactResult {
    if (!text) return { text, redacted: false, eventCount: 0 };

    let out = text;
    const beforeHash = hashText(text);
    const events: Array<{ detector: string; findingType: string; replacement: string }> = [];

    for (const rule of DETECTORS) {
      // Fresh instance per call — never reuse a stateful /g regex.
      const matches = out.match(rule.build());
      if (!matches || matches.length === 0) continue;

      out = out.replace(rule.build(), rule.replacement);
      for (let i = 0; i < matches.length; i++) {
        events.push({
          detector: rule.detector,
          findingType: rule.type,
          replacement: rule.replacement,
        });
      }
    }

    const afterHash = hashText(out);

    if (this.persist && events.length > 0) {
      this.recordEvents(events, beforeHash, afterHash, opts);
    }

    return {
      text: out,
      redacted: events.length > 0,
      eventCount: events.length,
    };
  }

  /**
   * Audit logging must never break the caller. Redaction runs on every LLM
   * response, so a logging failure used to abort the whole cycle: it took down
   * an agent run whenever its output happened to contain an email address.
   */
  private recordEvents(
    events: Array<{ detector: string; findingType: string; replacement: string }>,
    beforeHash: string,
    afterHash: string,
    opts: RedactOptions
  ): void {
    let db: ReturnType<typeof getDb> | null = null;
    try {
      db = getDb();
      const stmt = db.prepare(`
        INSERT INTO redaction_events
        (id, run_id, cycle_number, channel, artifact_path, detector, finding_type, replacement, before_hash, after_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const write = db.transaction(() => {
        for (const ev of events) {
          stmt.run(
            `red_${nanoid(10)}`,
            this.runId,
            opts.cycleNumber ?? null,
            opts.channel,
            opts.artifactPath ?? null,
            ev.detector,
            ev.findingType,
            ev.replacement,
            beforeHash,
            afterHash
          );
        }
      });
      write();
    } catch (err) {
      console.warn(
        `[redaction] failed to record ${events.length} redaction event(s): ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      try { db?.close(); } catch { /* already closed */ }
    }
  }

  /** Redact without touching the database — useful for tests and previews. */
  static redactOnly(text: string): RedactResult {
    return new RedactionFilter('dry_run', false).redact(text, { channel: 'output' });
  }
}
