-- ============================================================
-- AutoOrg Phase 2 Schema Extensions
-- Run: bun run src/db/migrate-phase2.ts
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: objections
-- Persistent cross-cycle objection tracker
-- The Critic raises objections. They live here until resolved.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS objections (
  id              TEXT PRIMARY KEY,        -- "obj_XXXXXXXX"
  run_id          TEXT NOT NULL,
  cycle_raised    INTEGER NOT NULL,        -- cycle when raised
  cycle_resolved  INTEGER,                 -- cycle when resolved (null if open)

  severity        TEXT NOT NULL
                    CHECK(severity IN ('BLOCKER','MAJOR','MINOR')),
  description     TEXT NOT NULL,
  proposed_fix    TEXT NOT NULL,
  evidence        TEXT,                    -- quote from the proposal

  resolved        INTEGER NOT NULL DEFAULT 0,   -- boolean
  resolution_note TEXT,                    -- how it was resolved

  -- Which agent raised it
  raised_by       TEXT NOT NULL DEFAULT 'Critic',

  -- Embedding for semantic dedup (Phase 4)
  embedding       BLOB,

  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_obj_run     ON objections(run_id);
CREATE INDEX IF NOT EXISTS idx_obj_open    ON objections(run_id, resolved);
CREATE INDEX IF NOT EXISTS idx_obj_severity ON objections(severity);

-- ────────────────────────────────────────────────────────────
-- TABLE: pipeline_steps
-- Tracks each step of the Phase 2 sequential pipeline
-- Engineer → Critic → Advocate → Archivist → CEO synthesis
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_steps (
  id          TEXT PRIMARY KEY,
  cycle_id    TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL,
  step_name   TEXT NOT NULL,             -- 'ceo_assign'|'engineer'|'critic'|'advocate'|'archivist'|'ceo_synthesis'|'judge'
  step_order  INTEGER NOT NULL,
  started_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at    DATETIME,
  duration_ms INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','running','completed','failed','skipped')),
  input_hash  TEXT,                      -- SHA-256 of what this step received
  output_hash TEXT,                      -- SHA-256 of what this step produced
  error_msg   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_cycle ON pipeline_steps(cycle_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: cycle_context
-- Stores the rich context each agent received
-- Enables post-run agent interviews
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cycle_context (
  id            TEXT PRIMARY KEY,
  cycle_id      TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  run_id        TEXT NOT NULL,
  agent_role    TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_message  TEXT NOT NULL,
  response      TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cycle_id, agent_role)
);

CREATE INDEX IF NOT EXISTS idx_ctx_cycle ON cycle_context(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ctx_role  ON cycle_context(run_id, agent_role);

-- ────────────────────────────────────────────────────────────
-- TABLE: interview_sessions
-- Post-run agent interviews (Phase 2 feature)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_sessions (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  agent_role  TEXT NOT NULL,
  cycle_scope INTEGER,                   -- which cycle the interview focuses on
  started_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at    DATETIME,
  turns       TEXT NOT NULL DEFAULT '[]' -- JSON array of {role, content} turns
);

-- ────────────────────────────────────────────────────────────
-- TABLE: websocket_events
-- Ring buffer of events broadcast to dashboard clients
-- Kept for dashboard replay (last 500 events per run)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS websocket_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload    TEXT NOT NULL,              -- JSON
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_run ON websocket_events(run_id, id DESC);

-- Clean up old events (keep last 500 per run)
CREATE TRIGGER IF NOT EXISTS trg_ws_cleanup
AFTER INSERT ON websocket_events
BEGIN
  DELETE FROM websocket_events
  WHERE run_id = NEW.run_id
    AND id NOT IN (
      SELECT id FROM websocket_events
      WHERE run_id = NEW.run_id
      ORDER BY id DESC
      LIMIT 500
    );
END;

-- ────────────────────────────────────────────────────────────
-- VIEWS (Phase 2 additions)
-- ────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_objection_summary AS
SELECT
  run_id,
  COUNT(*)                                    AS total,
  COUNT(CASE WHEN severity='BLOCKER' THEN 1 END) AS blockers,
  COUNT(CASE WHEN severity='MAJOR'   THEN 1 END) AS majors,
  COUNT(CASE WHEN severity='MINOR'   THEN 1 END) AS minors,
  COUNT(CASE WHEN resolved=1         THEN 1 END) AS resolved_count,
  COUNT(CASE WHEN resolved=0         THEN 1 END) AS open_count
FROM objections
GROUP BY run_id;

CREATE VIEW IF NOT EXISTS v_pipeline_summary AS
SELECT
  ps.cycle_id,
  c.run_id,
  c.cycle_number,
  GROUP_CONCAT(ps.step_name || ':' || ps.status, ', ') AS steps,
  SUM(ps.duration_ms)  AS total_pipeline_ms,
  COUNT(ps.id)         AS step_count
FROM pipeline_steps ps
JOIN cycles c ON c.id = ps.cycle_id
GROUP BY ps.cycle_id;
