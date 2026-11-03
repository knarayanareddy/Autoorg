/**
 * Provider environment resolution.
 *
 * Regression coverage for the setup bug where `.env.example` documented
 * `ANTHROPIC_API_KEY` but the adapter read only `AUTOORG_API_KEY_ANTHROPIC`.
 * Anthropic is the default provider for every role, so following the README
 * produced "Anthropic API key is not set" on a correctly configured machine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  providerApiKey, providerBaseUrl, providerEnvHint, getEnv,
} from '../src/config/env.ts';

const TOUCHED = [
  'ANTHROPIC_API_KEY', 'AUTOORG_API_KEY_ANTHROPIC', 'ANTHROPIC_BASE_URL',
  'OPENAI_API_KEY', 'AUTOORG_API_KEY_OPENAI', 'OPENAI_BASE_URL',
  'GROQ_API_KEY', 'GROQ_BASE_URL', 'TOGETHER_API_KEY', 'TOGETHER_BASE_URL',
  'GEMINI_API_KEY',
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of TOUCHED) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('getEnv', () => {
  it('returns the first defined, non-empty value', () => {
    expect(getEnv('A_TOTALLY_MISSING_VAR')).toBe('');
    process.env.ANTHROPIC_API_KEY = 'from-primary';
    expect(getEnv('ANTHROPIC_API_KEY', 'AUTOORG_API_KEY_ANTHROPIC')).toBe('from-primary');
  });

  it('falls through to the fallback name', () => {
    process.env.AUTOORG_API_KEY_ANTHROPIC = 'from-legacy';
    expect(getEnv('ANTHROPIC_API_KEY', 'AUTOORG_API_KEY_ANTHROPIC')).toBe('from-legacy');
  });

  it('treats an empty string as unset', () => {
    process.env.ANTHROPIC_API_KEY = '';
    process.env.AUTOORG_API_KEY_ANTHROPIC = 'legacy';
    expect(getEnv('ANTHROPIC_API_KEY', 'AUTOORG_API_KEY_ANTHROPIC')).toBe('legacy');
  });
});

describe('providerApiKey', () => {
  it('reads the documented ANTHROPIC_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-documented';
    expect(providerApiKey('anthropic')).toBe('sk-ant-documented');
  });

  it('still reads the legacy AUTOORG_API_KEY_ANTHROPIC', () => {
    process.env.AUTOORG_API_KEY_ANTHROPIC = 'sk-ant-legacy';
    expect(providerApiKey('anthropic')).toBe('sk-ant-legacy');
  });

  it('prefers the documented name when both are set', () => {
    process.env.ANTHROPIC_API_KEY = 'documented';
    process.env.AUTOORG_API_KEY_ANTHROPIC = 'legacy';
    expect(providerApiKey('anthropic')).toBe('documented');
  });

  it('honours an explicit argument over the environment', () => {
    process.env.ANTHROPIC_API_KEY = 'env';
    expect(providerApiKey('anthropic', 'explicit')).toBe('explicit');
  });

  it('resolves every documented provider', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.GROQ_API_KEY = 'gsk-groq';
    process.env.TOGETHER_API_KEY = 't-together';
    process.env.GEMINI_API_KEY = 'g-gemini';

    expect(providerApiKey('openai')).toBe('sk-openai');
    expect(providerApiKey('groq')).toBe('gsk-groq');
    expect(providerApiKey('together')).toBe('t-together');
    expect(providerApiKey('gemini')).toBe('g-gemini');
  });

  it('returns an empty string when nothing is configured', () => {
    expect(providerApiKey('anthropic')).toBe('');
  });
});

describe('providerBaseUrl', () => {
  it('reads the documented base URL variables', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.internal';
    process.env.GROQ_BASE_URL = 'https://groq.internal/v1';
    process.env.TOGETHER_BASE_URL = 'https://together.internal/v1';

    expect(providerBaseUrl('anthropic')).toBe('https://proxy.internal');
    expect(providerBaseUrl('groq')).toBe('https://groq.internal/v1');
    expect(providerBaseUrl('together')).toBe('https://together.internal/v1');
  });

  it('returns an empty string when unset', () => {
    expect(providerBaseUrl('openai')).toBe('');
  });
});

describe('providerEnvHint', () => {
  it('names both accepted variables', () => {
    expect(providerEnvHint('anthropic')).toContain('ANTHROPIC_API_KEY');
    expect(providerEnvHint('anthropic')).toContain('AUTOORG_API_KEY_ANTHROPIC');
  });
});
