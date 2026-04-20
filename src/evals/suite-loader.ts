import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface LoadedBenchmarkCase {
  id: string;
  suiteName: string;
  caseName: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'stress';
  dir: string;
  org: string;
  constitution: string;
  gold?: string;
  config: Record<string, any>;
  acceptance: Record<string, any>;
}

export class BenchmarkSuiteLoader {
  constructor(private root = path.join(process.cwd(), 'benchmarks', 'suites')) {}

  async loadSuite(suiteName: string): Promise<LoadedBenchmarkCase[]> {
    const suiteDir = path.join(this.root, suiteName);
    const entries = await readdir(suiteDir, { withFileTypes: true });
    const out: LoadedBenchmarkCase[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = path.join(suiteDir, entry.name);
      try {
        const caseJson = JSON.parse(await readFile(path.join(dir, 'case.json'), 'utf-8'));
        const org = await readFile(path.join(dir, 'org.md'), 'utf-8');
        const constitution = await readFile(path.join(dir, 'constitution.md'), 'utf-8');
        const gold = await readFile(path.join(dir, 'gold.md'), 'utf-8').catch(() => undefined);

        out.push({
          id: `bc_${nanoid(10)}`,
          suiteName,
          caseName: caseJson.case_name ?? entry.name,
          category: caseJson.category ?? 'general',
          difficulty: caseJson.difficulty ?? 'medium',
          dir,
          org,
          constitution,
          gold,
          config: caseJson,
          acceptance: caseJson.acceptance ?? {},
        });
      } catch (err) {
        console.error(`Failed to load benchmark case in ${dir}:`, err);
      }
    }

    return out;
  }

  async persistSuiteInDb(suiteName: string, description = '') {
    const cases = await this.loadSuite(suiteName);
    const db = getDb();

    const suiteId = `bs_${nanoid(10)}`;
    db.prepare(`
      INSERT OR IGNORE INTO benchmark_suites
      (id, suite_name, description, tags_json)
      VALUES (?, ?, ?, '[]')
    `).run(suiteId, suiteName, description || `${suiteName} benchmark suite`);

    const suiteRow = db.prepare(`
      SELECT id FROM benchmark_suites WHERE suite_name = ?
    `).get(suiteName) as { id: string };

    for (const c of cases) {
      db.prepare(`
        INSERT OR REPLACE INTO benchmark_cases
        (id, suite_id, case_name, category, difficulty, org_path, constitution_path, gold_path, case_config_json, acceptance_json, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        c.id,
        suiteRow.id,
        c.caseName,
        c.category,
        c.difficulty,
        path.join(c.dir, 'org.md'),
        path.join(c.dir, 'constitution.md'),
        c.gold ? path.join(c.dir, 'gold.md') : null,
        JSON.stringify(c.config),
        JSON.stringify(c.acceptance),
      );
    }

    db.close();
    return cases;
  }
}
