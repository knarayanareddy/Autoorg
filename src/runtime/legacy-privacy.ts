import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Database } from 'bun:sqlite';
import { sanitizeRunConfig } from './run-config.js';
import { OMITTED_TRANSCRIPT_CONTENT, safeTranscriptAction } from './transcript-privacy.js';

const ROLES = new Set(['CEO', 'Engineer', 'Critic', 'DevilsAdvocate', 'Archivist', 'RatchetJudge', 'DreamAgent', 'UltraPlanner', 'ORCHESTRATOR', 'RATCHET']);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type FilePlan = { file: string; beforeHash: string; after: string };
type ConfigPlan = { id: string; before: string; after: string };
export interface LegacyPrivacyPlan { files: FilePlan[]; configs: ConfigPlan[]; indexedCount: number; contextCount: number; executionCount: number }

/** Pure planning step: validates input and makes no filesystem/database changes. */
export function planLegacyPrivacyCleanup(transcriptsDir: string, db: Database | null): LegacyPrivacyPlan {
  const files: FilePlan[] = [];
  if (existsSync(transcriptsDir)) {
    if (!lstatSync(transcriptsDir).isDirectory()) throw new Error('Transcript directory must be a real directory, not a symlink');
    for (const name of readdirSync(transcriptsDir).filter(n => n.endsWith('.jsonl')).sort()) {
      const file = path.join(transcriptsDir, name);
      if (!lstatSync(file).isFile()) throw new Error(`Transcript must be a regular file: ${name}`);
      const raw = readFileSync(file, 'utf8');
      const lines = raw.split('\n').filter(line => line.trim() !== '');
      const safe = lines.map((line, index) => {
        let entry: Record<string, unknown>;
        try {
          const parsed = JSON.parse(line);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
          entry = parsed;
        } catch { throw new Error(`Malformed transcript ${name} line ${index + 1}; no changes made`); }
        const ts = typeof entry.ts === 'string' && Number.isFinite(Date.parse(entry.ts)) ? new Date(entry.ts).toISOString() : null;
        const role = typeof entry.role === 'string' && ROLES.has(entry.role) ? entry.role : 'UNKNOWN';
        const action = typeof entry.action === 'string' ? safeTranscriptAction(entry.action) : 'other';
        return JSON.stringify({
          ts, run_id: typeof entry.run_id === 'string' ? (/^legacy_[0-9a-f]{16}$/.test(entry.run_id) ? entry.run_id : `legacy_${hash(entry.run_id).slice(0, 16)}`) : null,
          cycle: typeof entry.cycle === 'number' && Number.isSafeInteger(entry.cycle) ? entry.cycle : null,
          role, action, content: OMITTED_TRANSCRIPT_CONTENT,
          ...(typeof entry.tokens === 'number' && Number.isFinite(entry.tokens) ? { tokens: entry.tokens } : {}),
          ...(typeof entry.cost_usd === 'number' && Number.isFinite(entry.cost_usd) ? { cost_usd: entry.cost_usd } : {}),
        });
      });
      files.push({ file, beforeHash: hash(raw), after: safe.length ? safe.join('\n') + '\n' : '' });
    }
  }
  let configs: ConfigPlan[] = [];
  let indexedCount = 0;
  let contextCount = 0;
  let executionCount = 0;
  if (db) {
    const rows = db.query('SELECT id, config_json FROM runs').all() as Array<{ id: string; config_json: string }>;
    configs = rows.map(row => {
      let parsed: unknown;
      try { parsed = JSON.parse(row.config_json); } catch { throw new Error('Malformed run configuration; no changes made'); }
      return { id: row.id, before: row.config_json, after: JSON.stringify(sanitizeRunConfig(parsed)) };
    });
    indexedCount = (db.query('SELECT count(*) AS n FROM transcript_index').get() as { n: number }).n;
    contextCount = (db.query('SELECT count(*) AS n FROM cycle_context').get() as { n: number }).n;
    executionCount = (db.query('SELECT count(*) AS n FROM agent_executions').get() as { n: number }).n;
  }
  return { files, configs, indexedCount, contextCount, executionCount };
}

/** Requires all AutoOrg processes stopped. Restartable, but not cross-resource atomic. */
export function applyLegacyPrivacyCleanup(plan: LegacyPrivacyPlan, db: Database | null): void {
  for (const f of plan.files) {
    if (!lstatSync(f.file).isFile() || hash(readFileSync(f.file, 'utf8')) !== f.beforeHash) throw new Error('Transcript changed since planning; no files written');
  }
  if (db) {
    db.run('PRAGMA secure_delete = ON');
    db.transaction(() => {
      const read = db.query('SELECT config_json FROM runs WHERE id = ?');
      const update = db.query('UPDATE runs SET config_json = ? WHERE id = ?');
      for (const row of plan.configs) {
        const current = read.get(row.id) as { config_json: string } | null;
        if (!current || current.config_json !== row.before) throw new Error('Run configuration changed since planning');
        update.run(row.after, row.id);
      }
      db.query('UPDATE cycle_context SET system_prompt = ?, user_message = ?, response = ?').run(OMITTED_TRANSCRIPT_CONTENT, OMITTED_TRANSCRIPT_CONTENT, OMITTED_TRANSCRIPT_CONTENT);
      db.run('UPDATE agent_executions SET system_prompt_hash = NULL, output_text = NULL');
      db.run('DELETE FROM transcript_index');
      db.run("INSERT INTO transcript_fts(transcript_fts) VALUES ('rebuild')");
    }).immediate();
  }
  for (const f of plan.files) {
    const temp = `${f.file}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      writeFileSync(temp, f.after, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      renameSync(temp, f.file);
    } finally { try { unlinkSync(temp); } catch { /* renamed or never created */ } }
  }
}
