/**
 * AutoOrg — Native Google Gemini Adapter
 *
 * Uses the official @google/generative-ai SDK instead of the OpenAI-compat proxy.
 * Supports:
 *   - Text generation (run)
 *   - Structured output with Zod schema (structured)
 *   - Native text embeddings (embed) — models/text-embedding-004
 *   - Multi-turn chat (for agent interview sessions)
 *
 * Usage:
 *   const adapter = new GeminiAdapter('gemini-1.5-pro-latest');
 *   const text = await adapter.run('system prompt', 'user message', {});
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { ZodSchema } from 'zod';
import type { LLMAdapter, RunOpts } from '@/types/index.js';
import { parseStructuredOutputLenient } from '@/utils/structured-output.js';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Default embedding model — free tier, 768 dimensions
const EMBEDDING_MODEL = 'models/text-embedding-004';

export class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(
    model:  string = 'gemini-1.5-flash-latest',
    apiKey?: string
  ) {
    const key = apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('[GeminiAdapter] Missing GEMINI_API_KEY or GOOGLE_API_KEY');

    this.client    = new GoogleGenerativeAI(key);
    this.modelName = model;
  }

  // ── Text generation ──────────────────────────────────────────────────────
  async run(
    systemPrompt: string,
    userMessage:  string,
    _opts:        RunOpts
  ): Promise<string> {
    const model = this.client.getGenerativeModel({
      model:          this.modelName,
      systemInstruction: systemPrompt,
      safetySettings: SAFETY_SETTINGS,
    });

    const result = await model.generateContent(userMessage);
    return result.response.text();
  }

  // ── Structured output ────────────────────────────────────────────────────
  async structured<T>(
    systemPrompt: string,
    userMessage:  string,
    schema:       ZodSchema<T>,
    _opts:        RunOpts
  ): Promise<T> {
    const model = this.client.getGenerativeModel({
      model:          this.modelName,
      systemInstruction: `${systemPrompt}\n\nRespond ONLY with valid JSON matching the requested schema. No markdown fences.`,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(userMessage);
    const raw    = result.response.text();
    return parseStructuredOutputLenient(raw, schema);
  }

  // ── Native text embeddings ───────────────────────────────────────────────
  async embed(text: string): Promise<number[]> {
    const model  = this.client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }

  // ── Multi-turn chat (for interview engine) ───────────────────────────────
  startChat(systemPrompt: string) {
    const model = this.client.getGenerativeModel({
      model:             this.modelName,
      systemInstruction: systemPrompt,
      safetySettings:    SAFETY_SETTINGS,
    });

    return model.startChat({ history: [] });
  }
}

// ── Model tier helpers ────────────────────────────────────────────────────
export const GEMINI_MODELS = {
  // Most capable — use for Ratchet Judge (equivalent to Opus tier)
  pro:          'gemini-1.5-pro-latest',
  // Fast and cheap — use for workers (equivalent to Haiku tier)
  flash:        'gemini-1.5-flash-latest',
  // Ultra-low latency (equivalent to Haiku-instant)
  flash8b:      'gemini-1.5-flash-8b-latest',
  // Next generation
  pro2:         'gemini-2.0-pro-exp',
  flash2:       'gemini-2.0-flash-exp',
} as const;
