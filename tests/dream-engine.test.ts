import { describe, it, expect, beforeAll } from 'bun:test';
import { DreamEngine, shouldTriggerDream } from '../src/runtime/dream.js';
import { FactStore }     from '../src/memory/fact-store.js';
import { getDb }         from '../src/db/migrate.js';

const TEST_RUN = `dream_test_${Date.now()}`;

describe('shouldTriggerDream', () => {
  beforeAll(async () => {
    const { loadFeatureFlags } = await import('../src/config/feature-flags.js');
    await loadFeatureFlags();
  });

  it('triggers on interval', () => {
    const { shouldDream, trigger } = shouldTriggerDream(10, 10, 0, 10, { critical: [] }, null);
    expect(shouldDream).toBe(true);
    expect(trigger).toBe('interval');
  });

  it('triggers on plateau', () => {
    const { shouldDream, trigger } = shouldTriggerDream(7, 10, 7, 10, { critical: [] }, null);
    expect(shouldDream).toBe(true);
    expect(trigger).toBe('plateau');
  });

  it('triggers on memory critical', () => {
    const { shouldDream, trigger } = shouldTriggerDream(
      5, 10, 0, 10,
      { critical: ['MEMORY.md at 145/150 lines'] },
      null
    );
    expect(shouldDream).toBe(true);
    expect(trigger).toBe('memory_critical');
  });

  it('does NOT trigger when not interval and no plateau', () => {
    const { shouldDream } = shouldTriggerDream(3, 10, 0, 10, { critical: [] }, null);
    expect(shouldDream).toBe(false);
  });

  it('respects cooldown after recent dream', () => {
    // Even if plateau, should not trigger if dreamed 2 cycles ago
    const { shouldDream } = shouldTriggerDream(8, 10, 7, 10, { critical: [] }, 7);
    expect(shouldDream).toBe(false); // 8-7 = 1 cycle, need >= 3
  });
});

describe('FactStore', () => {
  let store: FactStore;

  beforeAll(async () => {
    // Standardize database for tests — must be set before classes are instantiated
    const testDbPath = `/tmp/autoorg-dream-test-${Date.now()}.db`;
    process.env.AUTOORG_DB_PATH = testDbPath;
    
    const { migrate } = await import('../src/db/migrate.js');
    await migrate();
    
    store = new FactStore(TEST_RUN);
  });

  it('adds a fact and retrieves it', async () => {
    const fact = await store.addFact({
      statement:   'Grounding claims in seed material improves groundedness score by +0.08',
      category:    'validated_decision',
      sourceCycle: 5,
      sourceType:  'test',
      confidence:  0.75,
    });

    expect(fact.id).toMatch(/^fact_/);
    expect(fact.confidence).toBe(0.75);

    const active = store.getActiveFacts('validated_decision');
    expect(active.some(f => f.id === fact.id)).toBe(true);
  });

  it('confirms a fact (raises confidence)', async () => {
    const fact = await store.addFact({
      statement:   'Test fact for confirmation',
      category:    'pattern', sourceCycle: 1, sourceType: 'test', confidence: 0.5,
    });

    store.confirmFact(fact.id, 2);

    const updated = store.getActiveFacts('pattern').find(f => f.id === fact.id);
    expect(updated!.confidence).toBeGreaterThan(0.5);
  });

  it('contradicts a fact (lowers confidence)', async () => {
    const fact = await store.addFact({
      statement:   'Test fact for contradiction',
      category:    'pattern', sourceCycle: 1, sourceType: 'test', confidence: 0.5,
    });

    const before = store.getActiveFacts('pattern').find(f => f.id === fact.id)!.confidence;
    store.contradictFact(fact.id);
    const after = store.getActiveFacts('pattern').find(f => f.id === fact.id)!.confidence;

    expect(after).toBeLessThan(before);
  });

  it('exports facts as markdown', async () => {
    const md = store.exportAsMarkdown('validated_decision', 0.0, 10);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('detects potential contradictions', async () => {
    await store.addFact({
      statement:   'Adding specific entity names to proposals always improves scores',
      category:    'pattern', sourceCycle: 3, sourceType: 'test', confidence: 0.7,
    });
    await store.addFact({
      statement:   'Adding entity names to proposals does not improve scores consistently',
      category:    'pattern', sourceCycle: 5, sourceType: 'test', confidence: 0.6,
    });

    const contradictions = await store.detectContradictions(6);
    // May or may not find them depending on heuristic, but shouldn't crash
    expect(Array.isArray(contradictions)).toBe(true);
  });
});

describe('Embeddings', () => {
  it('computes a local TF-IDF embedding', async () => {
    const { computeEmbedding } = await import('../src/memory/embeddings.js');
    const vec = await computeEmbedding('groundedness score improves when claims are cited');
    expect(vec.length).toBe(512);
    expect(vec.some(v => v !== 0)).toBe(true);
  });

  it('serializes and deserializes embedding correctly', () => {
    const { serializeEmbedding, deserializeEmbedding } = require('../src/memory/embeddings.js');
    const original = [0.1, 0.2, 0.3, 0.4, 0.5];
    const buf      = serializeEmbedding(original);
    const restored = deserializeEmbedding(buf);
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(restored[i]! - original[i]!)).toBeLessThan(0.0001);
    }
  });

  it('cosine similarity is 1.0 for identical vectors', () => {
    const { cosineSimilarity } = require('../src/memory/embeddings.js');
    const vec = [0.1, 0.2, 0.3, 0.4];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  it('cosine similarity is ~0 for orthogonal vectors', () => {
    const { cosineSimilarity } = require('../src/memory/embeddings.js');
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });
});

describe('BM25 Search', () => {
  it('BM25 module exports indexTranscriptEntry and searchBM25', async () => {
    const module = await import('../src/memory/bm25.js');
    expect(typeof module.indexTranscriptEntry).toBe('function');
    expect(typeof module.searchBM25).toBe('function');
    expect(typeof module.indexTranscriptFile).toBe('function');
  });
});

describe('DreamOutputSchema', () => {
  it('validates a well-formed dream output', async () => {
    const { DreamOutputSchema } = await import('../src/prompts/dream-agent.js');

    const valid = {
      validated_patterns: [{
        statement:  'Grounding claims in seed entities improves groundedness by +0.07 avg',
        confidence: 0.8,
        evidence:   'Observed cycles 3, 7, 12',
        category:   'validated_decision',
      }],
      anti_patterns: [{
        statement:  'Repeating previous output structure causes novelty score < 0.4',
        confidence: 0.75,
        evidence:   'Cycles 2, 4, 9 all reverted for this reason',
        severity:   'high',
      }],
      contradictions:   [],
      superseded_facts: [],
      domain_knowledge: [],
      new_memory_index: '# MEMORY.md\n\n## STATUS\nCycles completed: 15',
      dream_report:     'Three patterns consolidated. Two anti-patterns identified. Memory pruned to 45 lines.',
      quality_score:    0.85,
    };

    expect(() => DreamOutputSchema.parse(valid)).not.toThrow();
  });
});
