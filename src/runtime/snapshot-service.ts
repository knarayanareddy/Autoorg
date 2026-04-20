import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class SnapshotService {
  constructor(private runId: string) {}

  async takeCycleSnapshot(cycleNumber: number) {
    const snapshotId = `snp_${nanoid(10)}`;
    const snapshotDir = path.join(process.cwd(), 'artifacts', 'snapshots', this.runId, `cycle_${cycleNumber}`);
    
    await mkdir(snapshotDir, { recursive: true });

    // 1. Snapshot the DB (the source of truth for state)
    const currentDbPath = path.join(process.cwd(), 'autoorg.db');
    const snapshotDbPath = path.join(snapshotDir, 'state.db');
    await copyFile(currentDbPath, snapshotDbPath);

    // 2. Snapshot metadata
    const metadata = {
      runId: this.runId,
      cycle: cycleNumber,
      timestamp: new Date().toISOString(),
      version: 'Phase 9',
    };
    await writeFile(path.join(snapshotDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // 3. Register in DB
    const db = getDb();
    db.prepare(`
      INSERT INTO mission_snapshots (id, run_id, cycle_number, snapshot_path, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      snapshotId,
      this.runId,
      cycleNumber,
      snapshotDir,
      JSON.stringify(metadata)
    );
    db.close();

    return { snapshotId, snapshotDir };
  }

  async restore(snapshotId: string) {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM mission_snapshots WHERE id = ?`).get(snapshotId) as any;
    db.close();

    if (!row) throw new Error('Snapshot not found.');

    const snapshotDbPath = path.join(row.snapshot_path, 'state.db');
    const activeDbPath = path.join(process.cwd(), 'autoorg.db');

    // WARNING: Destination overwrite
    await copyFile(snapshotDbPath, activeDbPath);
    
    return { ok: true, restoredToCycle: row.cycle_number };
  }
}
