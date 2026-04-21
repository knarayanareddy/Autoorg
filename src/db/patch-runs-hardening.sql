-- ============================================================
-- AutoOrg Phase 5.1 Patch: Runs Table Hardening
-- ============================================================

ALTER TABLE runs ADD COLUMN updated_at DATETIME NOT NULL DEFAULT (datetime('now'));

-- Create a trigger to auto-update the timestamp
CREATE TRIGGER IF NOT EXISTS update_runs_timestamp 
AFTER UPDATE ON runs
BEGIN
  UPDATE runs SET updated_at = datetime('now') WHERE id = OLD.id;
END;
