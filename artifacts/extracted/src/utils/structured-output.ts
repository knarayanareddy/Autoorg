TypeScript

/**
 * AutoOrg — Structured Output Parser
 * 
 * LLMs don't always return clean JSON even when asked nicely.
 * This utility extracts and validates JSON from messy LLM output.
 * It tries multiple extraction strategies before giving up.
 */

import { z } from 'zod';

export class StructuredOutputError extends Error {
  constructor(
    public readonly rawOutput: string,
    public readonly parseError: string
  ) {
    super(`Failed to parse structured output: ${parseError}`);
    this.name = 'StructuredOutputError';
  }
}

/**
 * Strategies to extract JSON from LLM output (tried in order):
 * 1. The entire output is valid JSON
 * 2. JSON is wrapped in ```json ... ``` code blocks
 * 3. JSON is wrapped in ``` ... ``` code blocks
 * 4. JSON is found between first { and last }
 * 5. JSON is found between first [ and last ]
 */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const trimmed = text.trim();

  // Strategy 1: Entire output
  candidates.push(trimmed);

  // Strategy 2: ```json blocks
  const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch?.[1]) candidates.push(jsonBlockMatch[1].trim());

  // Strategy 3: ``` blocks
  const codeBlockMatch = trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) candidates.push(codeBlockMatch[1].trim());

  // Strategy 4: First { to last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace  = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  // Strategy 5: First [ to last ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket  = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  return [...new Set(candidates)]; // deduplicate
}

/**
 * Parse and validate structured JSON output from an LLM response.
 * 
 * @param text    Raw LLM output text
 * @param schema  Zod schema to validate against
 * @returns       Validated, typed object
 * @throws        StructuredOutputError if no candidate parses correctly
 */
export function parseStructuredOutput<T>(
  text: string,
  schema: z.ZodType<T>
): T {
  const candidates = extractJsonCandidates(text);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = schema.safeParse(parsed);

      if (result.success) {
        return result.data;
      } else {
        errors.push(result.error.message.slice(0, 100));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  throw new StructuredOutputError(
    text.slice(0, 500),
    `Tried ${candidates.length} extraction strategies. Errors: ${errors.slice(0, 2).join(' | ')}`
  );
}

/**
 * Lenient parser — if structured parsing fails, return a fallback object.
 * Used for non-critical agents where partial output is acceptable.
 */
export function parseStructuredOutputLenient<T>(
  text: string,
  schema: z.ZodType<T>,
  fallback: T
): T {
  try {
    return parseStructuredOutput(text, schema);
  } catch {
    return fallback;
  }
}