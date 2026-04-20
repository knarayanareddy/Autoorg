import { z } from 'zod';

export class StructuredOutputError extends Error {
  constructor(public readonly rawOutput: string, public readonly parseError: string) {
    super(`Failed to parse structured output: ${parseError}`);
    this.name = 'StructuredOutputError';
  }
}

function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const trimmed = text.trim();
  candidates.push(trimmed);
  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch?.[1]) candidates.push(jsonBlockMatch[1].trim());
  const codeBlockMatch = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) candidates.push(codeBlockMatch[1].trim());
  const firstBrace = trimmed.indexOf('{');
  const lastBrace  = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket  = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }
  return [...new Set(candidates)];
}

export function parseStructuredOutput<T>(text: string, schema: z.ZodType<T>): T {
  const candidates = extractJsonCandidates(text);
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      else errors.push(result.error.message.slice(0, 100));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new StructuredOutputError(text.slice(0, 500), `Tried ${candidates.length} extraction strategies. Errors: ${errors.slice(0, 2).join(' | ')}`);
}

export function parseStructuredOutputLenient<T>(text: string, schema: z.ZodType<T>, fallback: T): T {
  try { return parseStructuredOutput(text, schema); } catch { return fallback; }
}
