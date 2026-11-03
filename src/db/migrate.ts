#!/usr/bin/env bun
/**
 * AutoOrg Database Migration
 *
 * Run: `bun run db:migrate` (or import `migrate()` / `getDb()`).
 *
 * Design
 * ──────
 * Migrations are ordered, immutable `.sql` files in `src/db/migrations/`.
 * Applied versions are recorded in `schema_migrations`, and a checksum of
 * each file is stored so editing an already-applied migration is detected
 * instead of silently ignored.
 *
 * Before this existed, `migrate()` just replayed one big `CREATE TABLE IF
 * NOT EXISTS` script. That meant an existing database never gained a new
 * column — schema changes only ever reached brand-new installs.
 *
 * Column additions still need `ensureColumn()`, because SQLite has no
 * `ADD COLUMN IF NOT EXISTS` and a plain `ALTER TABLE` is not idempotent.
 */

import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import chalk from 'chalk';

export function getDbPath(): string {
  return process.env.AUTOORG_DB_PATH || process.env.DB_PATH || './autoorg.db';
}

const MIGRATIONS_DIR = path.join(import.meta.dir, 'migrations');

/** Columns added after their table's original migration. Idempotent. */
interface ColumnSpec {
  table: string;
  column: string;
  ddl: string;
}

const ADDED_COLUMNS: ColumnSpec[] = [
  // 002 reconciliation — tables that predate the code that uses them.
  { table: 'benchmark_runs', column: 'orchestrator_version', ddl: 'TEXT' },
  { table: 'benchmark_runs', column: 'constitution_variant', ddl: "TEXT NOT NULL DEFAULT 'default'" },
  { table: 'benchmark_runs', column: 'template_variant', ddl: "TEXT NOT NULL DEFAULT 'default'" },
  { table: 'benchmark_runs', column: 'model_map_json', ddl: "TEXT NOT NULL DEFAULT '{}'" },

  { table: 'benchmark_attempts', column: 'seed', ddl: 'INTEGER' },
  { table: 'benchmark_attempts', column: 'model_map_json', ddl: "TEXT NOT NULL DEFAULT '{}'" },
  { table: 'benchmark_attempts', column: 'template_variant', ddl: "TEXT NOT NULL DEFAULT 'default'" },
  { table: 'benchmark_attempts', column: 'constitution_variant', ddl: "TEXT NOT NULL DEFAULT 'default'" },
  { table: 'benchmark_attempts', column: 'output_path', ddl: 'TEXT' },
  { table: 'benchmark_attempts', column: 'report_path', ddl: 'TEXT' },

  { table: 'benchmark_metrics', column: 'groundedness', ddl: 'REAL' },
  { table: 'benchmark_metrics', column: 'novelty', ddl: 'REAL' },
  { table: 'benchmark_metrics', column: 'consistency', ddl: 'REAL' },
  { table: 'benchmark_metrics', column: 'mission_alignment', ddl: 'REAL' },
  { table: 'benchmark_metrics', column: 'gold_match', ddl: 'REAL' },
  { table: 'benchmark_metrics', column: 'acceptance_pass', ddl: 'INTEGER' },

  { table: 'redaction_events', column: 'cycle_number', ddl: 'INTEGER' },
  { table: 'redaction_events', column: 'channel', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'artifact_path', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'detector', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'finding_type', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'replacement', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'before_hash', ddl: 'TEXT' },
  { table: 'redaction_events', column: 'after_hash', ddl: 'TEXT' },

  { table: 'security_findings', column: 'action_id', ddl: 'TEXT' },
  { table: 'security_findings', column: 'tool_execution_id', ddl: 'TEXT' },
  { table: 'security_findings', column: 'details_json', ddl: "TEXT NOT NULL DEFAULT '{}'" },

  { table: 'tool_executions', column: 'task_id', ddl: 'TEXT' },
  { table: 'tool_executions', column: 'team_id', ddl: 'TEXT' },
  { table: 'tool_executions', column: 'capability_class', ddl: 'TEXT' },
  { table: 'tool_executions', column: 'output_summary', ddl: 'TEXT' },
  { table: 'tool_executions', column: 'source_count', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'tool_executions', column: 'error_text', ddl: 'TEXT' },
  { table: 'tool_executions', column: 'started_at', ddl: 'DATETIME' },
  { table: 'tool_executions', column: 'finished_at', ddl: 'DATETIME' },

  { table: 'pending_actions', column: 'cycle_number', ddl: 'INTEGER' },
  { table: 'pending_actions', column: 'diff_path', ddl: 'TEXT' },
  { table: 'pending_actions', column: 'commit_message', ddl: 'TEXT' },
  { table: 'pending_actions', column: 'error_text', ddl: 'TEXT' },

  { table: 'interview_sessions', column: 'cycle_scope', ddl: 'TEXT' },
  { table: 'interview_sessions', column: 'ended_at', ddl: 'DATETIME' },
];

/**
 * Opens a connection. Callers are responsible for closing it.
 *
 * NOTE: this deliberately does NOT run migrations — importing this module used
 * to trigger a full schema apply as a side effect, which made tests order
 * dependent and hid migration failures.
 */
export function getDb(dbPath?: string): Database {
  const db = new Database(dbPath ?? getDbPath());

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA cache_size = -64000'); // 64MB cache
  db.run('PRAGMA busy_timeout = 5000');  // wait instead of failing on contention

  return db;
}

/** Add a column only if the table exists and the column is absent. */
export function ensureColumn(db: Database, spec: ColumnSpec): boolean {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(spec.table) as { name: string } | undefined;
  if (!table) return false;

  const columns = db.prepare(`PRAGMA table_info("${spec.table}")`).all() as Array<{ name: string }>;
  if (columns.some(c => c.name === spec.column)) return false;

  db.run(`ALTER TABLE "${spec.table}" ADD COLUMN "${spec.column}" ${spec.ddl}`);
  return true;
}

interface MigrationFile {
  version: number;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

/**
 * `PRAGMA journal_mode` / `synchronous` cannot be changed inside a transaction,
 * but migration files legitimately contain them. Pull those statements out so
 * they run before the DDL transaction starts.
 */
function splitPragmas(sql: string): { pragmas: string[]; ddl: string } {
  const pragmas: string[] = [];
  const ddl = sql
    .split('\n')
    .map(line => {
      if (/^\s*PRAGMA\s+\w+\s*=/i.test(line)) {
        pragmas.push(line.trim().replace(/;\s*$/, ''));
        return '';
      }
      return line;
    })
    .join('\n');
  return { pragmas, ddl };
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(f => {
    const match = f.match(/^(\d+)_(.+)\.sql$/);
    if (!match) throw new Error(`Migration file must be named NNN_name.sql: ${f}`);
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8');
    return {
      version: parseInt(match[1]!, 10),
      name: match[2]!,
      file: f,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16),
    };
  });
}

/**
 * Every flag read by `featureFlag()` must be seeded here, otherwise it
 * silently evaluates to false. Keep in sync with `KNOWN_FLAGS` in
 * `src/config/feature-flags.ts`.
 */
const FALLBACK_FLAGS: Array<[string, boolean, string]> = [
  // ── Governance / hardening ────────────────────────────────────────
  ['policyEngine',        true,  'Role-based action policy enforcement + action ledger'],
  ['unsafeActionDetector',true,  'Block/queue high and critical risk tool actions'],
  ['toolUse',             true,  'Give worker agents repo.search / web.fetch / sandbox.exec'],
  ['provenanceChain',     true,  'Link agent claims to citations each cycle'],
  ['factStore',           true,  'Persist durable facts extracted by the Archivist'],
  ['knowledgeGraph',      false, 'Knowledge graph grounding (Phase 4)'],
  ['scheduler',           true,  'Run scheduled jobs inside the daemon'],
  ['daemonMode',          true,  'Persistent background daemon mode'],
  ['cycleSnapshots',      true,  'Snapshot run state after every cycle'],
  ['githubIntegration',   true,  'Accept and process GitHub webhooks'],
  ['constitutionLock',    true,  'Terminate agents that modify constitution.md'],
  ['maxCostGuard',        true,  'Hard stop when API budget exceeded'],
  ['gitAuditTrail',       true,  'Commit/revert every proposal to git'],

  // ── Memory / dreams ───────────────────────────────────────────────
  ['autoDream',           true,  'Memory consolidation every N cycles (KAIROS)'],
  ['fullAutoDream',       true,  'Allow the dream agent to rewrite memory files'],
  ['dreamOnPlateau',      true,  'Trigger memory consolidation when scores plateau'],
  ['dreamReport',         true,  'Write a dream report artifact after consolidation'],
  ['memoryHealthMonitor', true,  'Trigger memory consolidation on line cap approach'],
  ['memoryTiers',         true,  'Three-tier memory system (MEMORY.md → facts/ → transcripts/)'],
  ['autonomousMemoryRewrite', false, 'Let the dream agent rewrite memory without approval'],

  // ── Retrieval ─────────────────────────────────────────────────────
  ['semanticSearch',      false, 'Embedding-based memory retrieval'],
  ['localEmbeddings',     false, 'Compute embeddings locally instead of via a provider'],
  ['hybridSearch',        false, 'Blend BM25 and semantic retrieval'],
  ['transcriptIndex',     false, 'Index transcripts for BM25 search'],
  ['graphRag',            false, 'Knowledge graph RAG grounding'],

  // ── Multi-agent / swarm ───────────────────────────────────────────
  ['parallelWorkers',     true,  'Run worker agents in parallel'],
  ['hierarchicalSwarm',   false, 'Multi-org swarm coordination'],
  ['coordinatorMode',     false, 'CEO spawns sub-coordinators for sub-domains'],
  ['multiOrg',            false, 'Run multiple orgs simultaneously from one command'],
  ['crossDomainSim',      false, 'Run two parallel orgs and compare outputs'],

  // ── Planning / strategy ───────────────────────────────────────────
  ['ultraplan',           false, 'Spawn Opus for 30-min deep planning on plateau (ULTRAPLAN)'],
  ['processReflection',   false, 'Per-cycle reflection reports on process debt'],
  ['strategicPivoting',   false, 'Allow the org to pivot its own strategy'],

  // ── Interface / ops ───────────────────────────────────────────────
  ['webDashboard',        false, 'Enable Next.js god-eye web dashboard'],
  ['streamingOutput',     false, 'Stream agent output to terminal in real-time'],
  ['humanCheckpoint',     false, 'Pause every N cycles for human review'],
  ['kairosDaemon',        false, 'Persistent background process that survives terminal close'],
  ['agentInterviews',     false, 'Post-run: interrogate any agent interactively'],
  ['buddyMode',           false, 'Terminal companion that reacts to score changes (BUDDY)'],
  ['resultsTsv',          true,  'Write results.tsv log every cycle'],
];

export interface MigrateResult {
  applied: string[];
  columnsAdded: number;
  alreadyCurrent: boolean;
}

export async function migrate(): Promise<MigrateResult> {
  const dbPath = getDbPath();
  console.log(chalk.cyan(`\n🗄️  Running AutoOrg database migrations [${dbPath}]...\n`));

  const db = getDb(dbPath);
  const result: MigrateResult = { applied: [], columnsAdded: 0, alreadyCurrent: true };

  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        checksum    TEXT NOT NULL,
        applied_at  DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const migrations = loadMigrations();
    const appliedRows = db
      .prepare(`SELECT version, name, checksum FROM schema_migrations`)
      .all() as Array<{ version: number; name: string; checksum: string }>;
    const appliedMap = new Map(appliedRows.map(r => [r.version, r]));

    // Detect an already-applied migration whose SQL has since been edited.
    for (const m of migrations) {
      const prev = appliedMap.get(m.version);
      if (prev && prev.checksum !== m.checksum) {
        throw new Error(
          `Migration ${m.file} was modified after being applied ` +
          `(recorded ${prev.checksum}, found ${m.checksum}). ` +
          `Add a new migration instead of editing an applied one.`
        );
      }
    }

    for (const m of migrations) {
      if (appliedMap.has(m.version)) continue;

      const { pragmas, ddl } = splitPragmas(m.sql);
      for (const pragma of pragmas) {
        db.run(pragma);
      }

      db.transaction(() => {
        db.exec(ddl);
        db.prepare(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)`
        ).run(m.version, m.name, m.checksum);
      })();

      result.applied.push(m.file);
      result.alreadyCurrent = false;
      console.log(chalk.green(`  ✓ Applied migration ${m.file}`));
    }

    // Column additions for databases created before the column existed.
    for (const spec of ADDED_COLUMNS) {
      if (ensureColumn(db, spec)) {
        result.columnsAdded++;
        console.log(chalk.green(`  ✓ Added column ${spec.table}.${spec.column}`));
      }
    }

    // Seed default feature flags (INSERT OR IGNORE keeps user overrides).
    const seedFlags = db.prepare(
      `INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES (?, ?, ?)`
    );
    db.transaction(() => {
      for (const [name, enabled, desc] of FALLBACK_FLAGS) {
        seedFlags.run(name, enabled ? 1 : 0, desc);
      }
    })();

    if (result.applied.length === 0) {
      console.log(chalk.gray('  ✓ Schema already up to date'));
    }

    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all() as Array<{ name: string }>;

    console.log(chalk.cyan(`\n  Tables (${tables.length}): ${tables.map(t => t.name).join(', ')}`));
    db.close();
    console.log(chalk.bold.green('\n✅ Database ready.\n'));
    return result;
  } catch (err) {
    db.close();
    throw err;
  }
}

/** Currently applied migration versions, newest last. */
export function getSchemaVersion(db: Database): number {
  const row = db
    .prepare(`SELECT MAX(version) AS v FROM schema_migrations`)
    .get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

// Only self-execute when run directly (`bun run src/db/migrate.ts`), never on import.
if (import.meta.main) {
  migrate().catch(err => {
    console.error(chalk.red(`\n❌ Migration failed: ${err instanceof Error ? err.message : err}\n`));
    process.exit(1);
  });
}
