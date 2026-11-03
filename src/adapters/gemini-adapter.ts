/**
 * AutoOrg — Native Google Gemini Adapter
 *
 * Uses the official @google/genai SDK instead of the OpenAI-compat proxy.
 * Supports:
 *   - Text generation (run)
 *   - Structured output with Zod schema (structured) — native JSON mode
 *   - Native text embeddings (embed) — gemini-embedding-001
 *   - Multi-turn chat (for agent interview sessions)
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { LLMAdapter, LLMProvider, LLMRunOptions, LLMResponse, LLMStructuredOptions } from '@/types/index.js';
import { parseStructuredOutput } from '@/utils/structured-output.js';
import { providerApiKey, providerBaseUrl } from '@/config/env.js';
import { estimateReportedCost } from '@/config/model-costs.js';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Default embedding model; verify dimensions before mixing with old indexes
const EMBEDDING_MODEL = 'gemini-embedding-001';

export class GeminiAdapter implements LLMAdapter {
  readonly provider: LLMProvider = 'gemini';

  private client:       GoogleGenAI;
  private defaultModel: string;

  constructor(
    model:  string = 'gemini-2.5-flash',
    apiKey?: string,
    baseUrl?: string
  ) {
    // GEMINI_API_KEY (documented), GOOGLE_API_KEY, or AUTOORG_API_KEY_GEMINI.
    const key = providerApiKey('gemini', apiKey) || process.env.GOOGLE_API_KEY || '';
    if (!key) {
      throw new Error(
        '[GeminiAdapter] Missing GEMINI_API_KEY (or GOOGLE_API_KEY). See .env.example.'
      );
    }

    const resolvedBaseUrl = providerBaseUrl('gemini', baseUrl);
    this.client = new GoogleGenAI({ apiKey: key, httpOptions: { retryOptions: { attempts: 1 }, ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}) } });
    this.defaultModel = model;
  }

  // ── Text generation ──────────────────────────────────────────────────────
  async run(opts: LLMRunOptions): Promise<LLMResponse> {
    const systemMsg = opts.messages.find(m => m.role === 'system')?.content ?? '';
    const contents = opts.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const response = await this.client.models.generateContent({
      model: opts.model ?? this.defaultModel,
      contents,
      config: {
        systemInstruction: systemMsg || undefined,
        safetySettings: SAFETY_SETTINGS,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
      },
    });
    const content = response.text;
    if (content === undefined) throw new Error('Gemini response contained no text');

    const inputTokens  = response.usageMetadata?.promptTokenCount     ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount  ?? 0;

    return {
      content,
      usage:            { inputTokens, outputTokens },
      promptTokens:     inputTokens,
      completionTokens: outputTokens,
      totalTokens:      inputTokens + outputTokens,
      costUsd:          estimateReportedCost(opts.model, response.usageMetadata?.promptTokenCount, response.usageMetadata?.candidatesTokenCount),
      model:            opts.model ?? this.defaultModel,
      provider:         'gemini',
    };
  }

  // ── Structured output ────────────────────────────────────────────────────
  async structured<T>(opts: LLMStructuredOptions<T>): Promise<T> {
    const systemMsg = opts.messages.find(m => m.role === 'system')?.content ?? '';
    const userMsgs  = opts.messages.filter(m => m.role !== 'system');
    const userText  = userMsgs.map(m => m.content).join('\n\n');

    const response = await this.client.models.generateContent({
      model: opts.model ?? this.defaultModel,
      contents: userText,
      config: {
        systemInstruction: systemMsg
          ? `${systemMsg}\n\nRespond ONLY with valid JSON. No markdown fences.`
          : 'Respond ONLY with valid JSON. No markdown fences.',
        safetySettings: SAFETY_SETTINGS,
        responseMimeType: 'application/json',
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
      },
    });
    if (response.text === undefined) throw new Error('Gemini response contained no text');
    return parseStructuredOutput(response.text, opts.schema);
  }

  // ── Native text embeddings ───────────────────────────────────────────────
  async embed(text: string): Promise<number[]> {
    const result = await this.client.models.embedContent({ model: EMBEDDING_MODEL, contents: text });
    const values = result.embeddings?.[0]?.values;
    if (!values) throw new Error('Gemini embedding response was empty');
    return values;
  }

  // ── Multi-turn chat (for interview engine) ───────────────────────────────
  startChat(systemPrompt: string) {
    return this.client.chats.create({
      model: this.defaultModel,
      history: [],
      config: { systemInstruction: systemPrompt, safetySettings: SAFETY_SETTINGS, automaticContinuation: false },
    });
  }
}

// ── Model tier helpers ────────────────────────────────────────────────────
export const GEMINI_MODELS = {
  // Most capable — use for Ratchet Judge (Opus-equivalent tier)
  pro:     'gemini-2.5-pro',
  // Fast + cheap — use for workers (Haiku-equivalent tier)
  flash:   'gemini-2.5-flash',
  // Ultra-low latency
  flash8b: 'gemini-2.5-flash-lite',
  // Next generation
  pro2:    'gemini-2.5-pro',
  flash2:  'gemini-2.5-flash',
} as const;
