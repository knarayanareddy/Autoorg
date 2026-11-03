import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { parseOrgMd } from '../src/config/org-parser.js';
import { writeFileSync, unlinkSync } from 'node:fs';

const TEST_ORG_MD = `
# Test org.md

## MISSION
Research the impact of large language models on software development productivity in 2025.

## MODEL ASSIGNMENTS
CEO:            anthropic/claude-sonnet-4-5
Engineer:       ollama/qwen2.5:14b
RatchetJudge:   anthropic/claude-opus-4

## DOMAIN SEED MATERIAL
Large language models have significantly changed software development workflows.
Studies show a 40% productivity increase in coding tasks.

## CONSTRAINTS
1. All claims must be grounded in empirical data.
2. Output must not exceed 3000 words.

## STOPPING CRITERIA
MAX_CYCLES: 20
PLATEAU_CYCLES: 5
MAX_API_SPEND_USD: 2.00
TARGET_SCORE: 0.80

## CYCLE SETTINGS
CYCLE_DREAM_INTERVAL: 5
MAX_WORKERS_PARALLEL: 3
`;

describe('OrgMd Parser', () => {
  const TEST_PATH = '/tmp/test-org.md';
  
  beforeAll(() => {
    writeFileSync(TEST_PATH, TEST_ORG_MD);
  });
  
  afterAll(() => {
    unlinkSync(TEST_PATH);
  });

  it('should parse mission correctly', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.mission).toContain('large language models');
  });

  it('should parse model assignments', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.modelAssignments.CEO?.provider).toBe('anthropic');
    expect(config.modelAssignments.CEO?.model).toBe('claude-sonnet-4-5');
    expect(config.modelAssignments.Engineer?.provider).toBe('ollama');
    expect(config.modelAssignments.Engineer?.model).toBe('qwen2.5:14b');
  });

  it('should parse stopping criteria', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.maxCycles).toBe(20);
    expect(config.plateauCycles).toBe(5);
    expect(config.maxApiSpendUsd).toBe(2.00);
    expect(config.targetScore).toBe(0.80);
  });

  it('should parse constraints', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.constraints.length).toBeGreaterThan(0);
    expect(config.constraints[0]).toContain('empirical');
  });

  it('should parse cycle settings', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.dreamInterval).toBe(5);
    expect(config.maxWorkersParallel).toBe(3);
  });

  it('should generate content hash', () => {
    const config = parseOrgMd(TEST_PATH);
    expect(config.contentHash).toHaveLength(64);
  });
});

describe('run configuration secrets', () => {
  it('does not embed provider environment keys in parsed model assignments', () => {
    const old = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'custom-anthropic-credential';
    const file = '/tmp/test-org-secrets.md';
    try {
      writeFileSync(file, TEST_ORG_MD);
      expect(JSON.stringify(parseOrgMd(file))).not.toContain('custom-anthropic-credential');
    } finally {
      unlinkSync(file);
      if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old;
    }
  });
  it('removes explicitly supplied model keys from persisted and broadcast config', async () => {
    const { sanitizeRunConfig } = await import('../src/runtime/run-config.ts');
    const config = { modelAssignments: { CEO: { provider: 'anthropic', model: 'model', apiKey: 'arbitrary-value' } }, mission: 'hello' };
    const safe = sanitizeRunConfig(config);
    expect(JSON.stringify(safe)).not.toContain('arbitrary-value');
    expect(config.modelAssignments.CEO.apiKey).toBe('arbitrary-value');
  });
});
