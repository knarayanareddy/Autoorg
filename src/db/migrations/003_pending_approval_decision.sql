-- 003: strict approval gating (OWASP A01).
--
-- keepOrRevert() gained a third outcome: a COMMIT-worthy candidate is staged
-- for human approval and lands only after it is approved. Cycles in limbo are
-- recorded as 'PENDING_APPROVAL', but cycles.decision carries a CHECK
-- constraint that predates the value. CHECKs cannot be altered in place, so
-- rebuild the table with the extended constraint (SQLite's standard 12-step
-- procedure — foreign keys off for the duration).
--
-- PRAGMA statements in this file run OUTSIDE the DDL transaction (the
-- migration runner splits them), which is required: `foreign_keys` cannot be
-- changed inside a transaction, and dropping `cycles` with foreign keys ON
-- would cascade-delete child rows in agent_executions/objections.
--
-- `legacy_alter_table = on` makes the final RENAME a pure catalog operation:
-- it does not rewrite (and therefore does not try to re-verify) other schema
-- objects. The view v_cycle_summary references `cycles` BY NAME, so after
-- the swap it resolves against the rebuilt table without ever being broken.

PRAGMA foreign_keys = off;
PRAGMA legacy_alter_table = on;

CREATE TABLE cycles__new (
  id              TEXT PRIMARY KEY,         -- nanoid
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  cycle_number    INTEGER NOT NULL,
  started_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at        DATETIME,
  duration_ms     INTEGER,

  -- Ratchet scores (null until judge runs)
  score_groundedness  REAL,
  score_novelty       REAL,
  score_consistency   REAL,
  score_alignment     REAL,
  score_composite     REAL,

  -- Ratchet decision. PENDING_APPROVAL = candidate staged, awaiting a human.
  decision        TEXT CHECK(decision IN ('COMMIT','REVERT','DISQUALIFIED','TIMEOUT','ERROR','PENDING_APPROVAL')),
  decision_reason TEXT,

  -- Git state
  git_commit_hash TEXT,                     -- null if REVERT / PENDING_APPROVAL
  git_baseline_hash TEXT,                   -- hash we're comparing against

  -- Cost tracking
  cycle_cost_usd  REAL DEFAULT 0.0,
  tokens_used     INTEGER DEFAULT 0,

  -- Proposal
  proposal_path   TEXT,                     -- path to workspace/proposals/cycle_N.md
  proposal_summary TEXT,

  -- autoDream ran this cycle?
  dream_ran       INTEGER DEFAULT 0,        -- boolean

  UNIQUE(run_id, cycle_number)
);

INSERT INTO cycles__new (
  id, run_id, cycle_number, started_at, ended_at, duration_ms,
  score_groundedness, score_novelty, score_consistency, score_alignment, score_composite,
  decision, decision_reason, git_commit_hash, git_baseline_hash,
  cycle_cost_usd, tokens_used, proposal_path, proposal_summary, dream_ran
)
SELECT
  id, run_id, cycle_number, started_at, ended_at, duration_ms,
  score_groundedness, score_novelty, score_consistency, score_alignment, score_composite,
  decision, decision_reason, git_commit_hash, git_baseline_hash,
  cycle_cost_usd, tokens_used, proposal_path, proposal_summary, dream_ran
FROM cycles;

DROP TABLE cycles;

ALTER TABLE cycles__new RENAME TO cycles;

CREATE INDEX IF NOT EXISTS idx_cycles_run_id ON cycles(run_id);
CREATE INDEX IF NOT EXISTS idx_cycles_score ON cycles(score_composite DESC);
