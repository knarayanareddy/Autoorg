TypeScript

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

const DETECTORS = [
  {
    detector: 'secret',
    type: 'openai_key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}\b/g,
    replacement: '[REDACTED:OPENAI_KEY]',
  },
  {
    detector: 'secret',
    type: 'anthropic_key',
    regex: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]',
  },
  {
    detector: 'token',
    type: 'github_token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  {
    detector: 'private_key',
    type: 'private_key_block',
    regex: /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g,
    replacement: '[REDACTED:PRIVATE_KEY]',
  },
  {
    detector: 'pii',
    type: 'email',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED:EMAIL]',
  },
  {
    detector: 'pii',
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED:SSN]',
  },
  {
    detector: 'pii',
    type: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED:PHONE]',
  },
];

export class RedactionFilter {
  constructor(private runId: string) {}

  redact(text: string, opts: {
    cycleNumber?: number;
    channel: 'transcript' | 'memory' | 'artifact' | 'log' | 'output';
    artifactPath?: string;
  }) {
    let out = text;
    const beforeHash = hashText(text);
    const events: Array<{ detector: string; findingType: string; replacement: string }> = [];

    for (const rule of DETECTORS) {
      if (rule.regex.test(out)) {
        out = out.replace(rule.regex, rule.replacement);
        events.push({
          detector: rule.detector,
          findingType: rule.type,
          replacement: rule.replacement,
        });
      }
    }

    const afterHash = hashText(out);

    if (events.length > 0) {
      const db = getDb();
      for (const ev of events) {
        db.prepare(`
          INSERT INTO redaction_events
          (id, run_id, cycle_number, channel, artifact_path, detector, finding_type, replacement, before_hash, after_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
      db.close();
    }

    return {
      text: out,
      redacted: events.length > 0,
      eventCount: events.length,
    };
  }
}
8. Unsafe action detector prompt