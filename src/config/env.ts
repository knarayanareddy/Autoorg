/**
 * Environment variable resolution.
 *
 * Why this exists: `.env.example` and the README documented `ANTHROPIC_API_KEY`,
 * but `AnthropicAdapter` read `AUTOORG_API_KEY_ANTHROPIC`. Anthropic is the
 * default provider for every role, so following the documented setup produced
 * "Anthropic API key is not set" on a correctly configured machine.
 *
 * Every provider credential now resolves through `providerApiKey()`, which
 * accepts both spellings with the documented one preferred. Base URLs are
 * honoured too — `.env.example` advertised `ANTHROPIC_BASE_URL`,
 * `GROQ_BASE_URL` and `TOGETHER_BASE_URL` and none were read.
 */

export function getEnv(key: string, ...fallbacks: string[]): string {
  for (const k of [key, ...fallbacks]) {
    const value = process.env[k];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'together' | 'ollama' | 'custom';

/**
 * Resolve an API key for a provider.
 *
 * Order: explicit argument → `<PROVIDER>_API_KEY` (the documented name) →
 * `AUTOORG_API_KEY_<PROVIDER>` (the legacy name).
 */
export function providerApiKey(provider: ProviderName, explicit?: string): string {
  if (explicit) return explicit;
  const upper = provider.toUpperCase();
  return getEnv(`${upper}_API_KEY`, `AUTOORG_API_KEY_${upper}`);
}

/** Resolve a base URL for a provider. */
export function providerBaseUrl(provider: ProviderName, explicit?: string): string {
  if (explicit) return explicit;
  const upper = provider.toUpperCase();
  return getEnv(`${upper}_BASE_URL`, `AUTOORG_BASE_URL_${upper}`);
}

/** Human-readable list of the env vars a provider looks for. */
export function providerEnvHint(provider: ProviderName): string {
  const upper = provider.toUpperCase();
  return `${upper}_API_KEY (or AUTOORG_API_KEY_${upper})`;
}
