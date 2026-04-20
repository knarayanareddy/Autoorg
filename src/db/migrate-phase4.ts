import { readFileSync } from 'node:fs';
import path             from 'node:path';
import chalk            from 'chalk';
import { getDb }        from '@/db/migrate.js';

async function migrate() {
  console.log(chalk.cyan('\n🗄️  Running Phase 4 migrations...\n'));

  const db     = getDb();
  const schema = readFileSync(
    path.join(import.meta.dir, 'schema-phase4.sql'),
    'utf-8'
  );

  db.exec(schema);

  // Seed Phase 4 feature flags
  const seedFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (flag_name, enabled, description) VALUES (?, ?, ?)
  `);

  const phase4Flags: [string, boolean, string][] = [
    ['knowledgeGraph',         true,  'Full knowledge graph system (Phase 4)'],
    ['graphRAG',               true,  'Graph-based retrieval augmented generation (Phase 4)'],
    ['entityExtraction',       true,  'LLM-based entity extraction from seed material (Phase 4)'],
    ['relationshipExtraction', true,  'LLM-based relationship extraction (Phase 4)'],
    ['graphGrounding',         true,  'Validate claims against knowledge graph (Phase 4)'],
    ['entityLinking',          true,  'Link entity mentions to graph nodes (Phase 4)'],
    ['graphVisualization',     true,  'D3.js graph visualization in web dashboard (Phase 4)'],
    ['incrementalGraphUpdate', true,  'Add nodes/edges during run based on new info (Phase 4)'],
    ['entityDisambiguation',   true,  'Merge duplicate entities automatically (Phase 4)'],
    ['graphHealthMonitor',     true,  'Monitor graph quality (orphans, density) (Phase 4)'],
    ['neo4jBackend',           false, 'Use Neo4j as primary graph DB (requires setup) (Phase 4)'],
    ['kuzuBackend',            false, 'Use Kuzu as graph DB (zero-dep alternative) (Phase 4)'],
    ['sqliteFallback',         true,  'Use SQLite for graph when Neo4j/Kuzu unavailable (Phase 4)'],
    ['graphExport',            true,  'Export graph to GraphML/JSON/Cypher (Phase 4)'],
    ['multiHopQueries',        true,  'Enable multi-hop graph traversal queries (Phase 4)'],
  ];

  const seedMany = db.transaction(() => {
    for (const [name, enabled, desc] of phase4Flags) {
      seedFlag.run(name, enabled ? 1 : 0, desc);
    }
  });
  seedMany();

  db.close();
  console.log(chalk.bold.green('\n✅ Phase 4 migration complete.\n'));
}

migrate().catch(console.error);
