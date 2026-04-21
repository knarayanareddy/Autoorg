/**
 * AutoOrg — Native Google Gemini Adapter
 *
 * Uses the official @google/generative-ai SDK instead of the OpenAI-compat proxy.
 * Supports:
 *   - Text generation (run)
 *   - Structured output with Zod schema (structured) — native JSON mode
 *   - Native text embeddings (embed) — models/text-embedding-004
 *   - Multi-turn chat (for agent interview sessions)
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { LLMAdapter, LLMProvider, LLMRunOptions, LLMResponse, LLMStructuredOptions } from '@/types/index.js';
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
  readonly provider: LLMProvider = 'gemini';

  private client:       GoogleGenerativeAI;
  private defaultModel: string;

  constructor(
    model:  string = 'gemini-1.5-flash-latest',
    apiKey?: string
  ) {
    const key = apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('[GeminiAdapter] Missing GEMINI_API_KEY or GOOGLE_API_KEY');

    this.client       = new GoogleGenerativeAI(key);
    this.defaultModel = model;
  }

  // ── Text generation ──────────────────────────────────────────────────────
  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    // Extract system prompt and user messages from standard LLMMessage array
    const systemMsg = opts.messages.find(m => m.role === 'system')?.content ?? '';
    const userMsgs  = opts.messages.filter(m => m.role !== 'system');
    const userText  = userMsgs.map(m => m.content).join('\n\n');

    const model = this.client.getGenerativeModel({
      model:             opts.model ?? this.defaultModel,
      systemInstruction: systemMsg || undefined,
      safetySettings:    SAFETY_SETTINGS,
    });

    const result   = await model.generateContent(userText);
    const response = result.response;
    const content  = response.text();

    const inputTokens  = response.usageMetadata?.promptTokenCount     ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount  ?? 0;

    return {
      content,
      usage:            { inputTokens, outputTokens },
      promptTokens:     inputTokens,
      completionTokens: outputTokens,
      totalTokens:      inputTokens + outputTokens,
      model:            opts.model ?? this.defaultModel,
      provider:         'gemini',
    };
  }

  // ── Structured output ────────────────────────────────────────────────────
  async structured<T>(opts: LLMStructuredOptions<T>): Promise<T> {
    const systemMsg = opts.messages.find(m => m.role === 'system')?.content ?? '';
    const userMsgs  = opts.messages.filter(m => m.role !== 'system');
    const userText  = userMsgs.map(m => m.content).join('\n\n');

    const model = this.client.getGenerativeModel({
      model: opts.model ?? this.defaultModel,
      systemInstruction: systemMsg
        ? `${systemMsg}\n\nRespond ONLY with valid JSON. No markdown fences.`
        : 'Respond ONLY with valid JSON. No markdown fences.',
      safetySettings:   SAFETY_SETTINGS,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(userText);
    const raw    = result.response.text();
    return parseStructuredOutputLenient(raw, opts.schema, null as unknown as T);
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
      model:             this.defaultModel,
      systemInstruction: systemPrompt,
      safetySettings:    SAFETY_SETTINGS,
    });

    return model.startChat({ history: [] });
  }
}

// ── Model tier helpers ────────────────────────────────────────────────────
export const GEMINI_MODELS = {
  // Most capable — use for Ratchet Judge (Opus-equivalent tier)
  pro:     'gemini-1.5-pro-latest',
  // Fast + cheap — use for workers (Haiku-equivalent tier)
  flash:   'gemini-1.5-flash-latest',
  // Ultra-low latency
  flash8b: 'gemini-1.5-flash-8b-latest',
  // Next generation
  pro2:    'gemini-2.0-pro-exp',
  flash2:  'gemini-2.0-flash-exp',
} as const;
