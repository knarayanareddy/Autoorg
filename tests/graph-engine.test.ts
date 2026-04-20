import { describe, it, expect, beforeAll } from 'bun:test';
import { createBestAvailableGraphDB } from '../src/graph/graph-db.js';
import { GraphBuilder } from '../src/graph/graph-builder.js';
import { GraphGroundingValidator } from '../src/graph/graph-grounding.js';
import { loadFeatureFlags } from '../src/config/feature-flags.js';

describe('Graph Engine (Phase 4)', () => {
  const runId = 'test_graph_run';
  
  beforeAll(async () => {
    process.env.AUTOORG_FLAG_knowledgeGraph = 'true';
    await loadFeatureFlags();
  });

  it('should create and connect to a graph database', async () => {
    const db = await createBestAvailableGraphDB(runId);
    expect(db.isConnected()).toBe(true);
    expect(db.backend).toBe('sqlite'); // Default for now
  });

  it('should create nodes and find them', async () => {
    const db = await createBestAvailableGraphDB(runId);
    await db.clear();

    const node = await db.createNode({
      label: 'AutoOrg',
      type: 'Organization',
      properties: { description: 'Autonomous research organization' }
    });

    expect(node.id).toBeDefined();
    expect(node.label).toBe('AutoOrg');

    const found = await db.getNodeByLabel('AutoOrg');
    expect(found).not.toBeNull();
    expect(found?.label).toBe('AutoOrg');
  });

  it('should create edges and find neighbors', async () => {
    const db = await createBestAvailableGraphDB(runId);
    await db.clear();

    const n1 = await db.createNode({ label: 'CEO', type: 'Person', properties: {} });
    const n2 = await db.createNode({ label: 'Proposal', type: 'Artifact', properties: {} });

    await db.createEdge({
      fromNodeId: n1.id,
      toNodeId: n2.id,
      relationship: 'PRODUCES',
      confidence: 0.9,
      properties: {}
    });

    const neighbors = await db.findNeighbors(n1.id, 1);
    expect(neighbors.length).toBe(1);
    expect(neighbors[0].label).toBe('Proposal');
  });

  it('should validate claims using grounding validator', async () => {
    const db = await createBestAvailableGraphDB(runId);
    await db.clear();

    await db.createNode({ label: 'Ollama', type: 'Technology', properties: { description: 'Local LLM runner' } });
    await db.createNode({ label: 'AutoOrg', type: 'Organization', properties: { description: 'Parent' } });
    const n1 = await db.getNodeByLabel('Ollama');
    const n2 = await db.getNodeByLabel('AutoOrg');

    await db.createEdge({
      fromNodeId: n2!.id,
      toNodeId: n1!.id,
      relationship: 'USES',
      confidence: 1.0,
      properties: {}
    });

    const validator = new GraphGroundingValidator(db);
    const result = await validator.validateClaim('AutoOrg uses Ollama for local inference.');

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.supportingNodes.map(n => n.label)).toContain('Ollama');
    expect(result.supportingNodes.map(n => n.label)).toContain('AutoOrg');
  });
});
