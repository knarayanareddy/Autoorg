import { describe, it, expect, mock, beforeAll } from 'bun:test';
import { parseStructuredOutput }  from '../src/utils/structured-output.js';
import { withRetry, RetryError }  from '../src/utils/retry.js';
import { estimateTokens }         from '../src/utils/token-counter.js';
import { z }                      from 'zod';

describe('StructuredOutput Parser', () => {
  const TestSchema = z.object({
    name:  z.string(),
    score: z.number(),
  });

  it('parses clean JSON', () => {
    const result = parseStructuredOutput('{"name":"test","score":0.75}', TestSchema);
    expect(result.name).toBe('test');
    expect(result.score).toBe(0.75);
  });

  it('parses JSON in code block', () => {
    const text = 'Here is my response:\n```json\n{"name":"test","score":0.5}\n```';
    const result = parseStructuredOutput(text, TestSchema);
    expect(result.score).toBe(0.5);
  });

  it('parses JSON embedded in prose', () => {
    const text = 'My analysis: {"name":"embedded","score":0.9} done.';
    const result = parseStructuredOutput(text, TestSchema);
    expect(result.name).toBe('embedded');
  });

  it('throws StructuredOutputError on unparseable output', () => {
    expect(() => parseStructuredOutput('completely invalid', TestSchema)).toThrow();
  });

  it('validates schema — rejects wrong types', () => {
    expect(() =>
      parseStructuredOutput('{"name": 123, "score": "wrong"}', TestSchema)
    ).toThrow();
  });
});

describe('Retry Utility', () => {
  it('succeeds on first attempt', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 'ok'; });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'success';
    }, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('success');
    expect(calls).toBe(3);
  });

  it('throws RetryError after max retries', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error('always fails'); }, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toBeInstanceOf(RetryError);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

describe('Token Counter', () => {
  it('estimates reasonable token count for English text', () => {
    const text   = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const tokens = estimateTokens(text);
    // Should be roughly 800-1400 for ~900 words
    expect(tokens).toBeGreaterThan(500);
    expect(tokens).toBeLessThan(2000);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('Critic Output Schema', () => {
  it('validates correct critic output', async () => {
    const { CriticOutputSchema } = await import('../src/prompts/critic.js');
    const valid = {
      steelman: 'The proposal makes reasonable arguments about X.',
      objections: [{
        id:          'obj_001',
        severity:    'MAJOR',
        description: 'The claim about Y is unsupported.',
        evidence:    'Line 3: "Y has been proven to..."',
        fix:         'Add citation from seed material.',
      }],
      resolved_from_previous: [],
      overall_verdict: 'NEEDS_WORK',
      verdict_reason:  'One major issue with groundedness.',
    };
    expect(() => CriticOutputSchema.parse(valid)).not.toThrow();
  });
});

describe('Judge Output Schema', () => {
  it('validates a complete judge output', async () => {
    const { JudgeOutputSchema } = await import('../src/prompts/ratchet-judge.js');
    const valid = {
      groundedness: { score: 0.75, reasoning: 'Good', grounded_claims: 8, total_claims: 10, ungrounded_examples: [] },
      novelty:      { score: 0.60, reasoning: 'Some repetition', overlap_with_previous: 'Minor', novel_elements: ['new angle'] },
      consistency:  { score: 0.85, reasoning: 'No blockers', blocker_objections: [], major_objections: [], internal_contradictions: [] },
      alignment:    { score: 0.70, reasoning: 'Mostly aligned', mission_elements_covered: ['main goal'], mission_elements_missing: [] },
      composite:    0.726,
      decision:     'COMMIT',
      justification: 'Strong groundedness and consistency drove the score above threshold.',
      improvement_directive: 'Improve novelty by avoiding repetition of previous cycle framings.',
    };
    expect(() => JudgeOutputSchema.parse(valid)).not.toThrow();
  });
});
