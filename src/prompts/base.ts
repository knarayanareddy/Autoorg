/**
 * AutoOrg — Base Prompt Utilities
 *
 * Shared utilities for building agent system prompts.
 * Every prompt is constructed fresh per-cycle with live context injected.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { OrgConfig } from '@/types/index.js';

// ── Context loaders ────────────────────────────────────────────────────
export async function loadMemoryIndex(): Promise<string> {
  const path = './memory/MEMORY.md';
  if (!existsSync(path)) return '[Memory index not yet initialized]';
  return readFile(path, 'utf-8');
}

export async function loadCurrentOutput(): Promise<string> {
  const path = './workspace/current_output.md';
  if (!existsSync(path)) return '[No output yet]';
  const content = await readFile(path, 'utf-8');
  // Cap at 3000 chars to avoid context overflow
  return content.slice(0, 3000) + (content.length > 3000 ? '\n\n[... truncated ...]' : '');
}

export async function loadFailedExperiments(): Promise<string> {
  const path = './memory/facts/failed_experiments.md';
  if (!existsSync(path)) return '[No failed experiments recorded yet]';
  const content = await readFile(path, 'utf-8');
  return content.slice(0, 2000);
}

export async function loadValidatedDecisions(): Promise<string> {
  const path = './memory/facts/validated_decisions.md';
  if (!existsSync(path)) return '[No validated decisions yet]';
  const content = await readFile(path, 'utf-8');
  return content.slice(0, 2000);
}

export async function loadConstitution(): Promise<string> {
  const path = './constitution.md';
  if (!existsSync(path)) throw new Error('constitution.md not found');
  return readFile(path, 'utf-8');
}

// ── Shared context block ────────────────────────────────────────────────
export async function buildSharedContext(
  config: OrgConfig,
  cycleNumber: number,
  bestScore: number,
  maxCycles: number
): Promise<string> {
  const memoryIndex = await loadMemoryIndex();
  const currentOutput = await loadCurrentOutput();

  return `
## ORGANIZATIONAL CONTEXT
You are a member of an autonomous research organization called AutoOrg.
Your organization operates in a continuous improvement loop.

**Mission:** ${config.mission}

**Current Status:**
- Cycle: ${cycleNumber} of ${maxCycles}
- Best score achieved: ${bestScore.toFixed(4)} / 1.0
- Target score: ${config.targetScore}

## CONSTRAINTS (NEVER VIOLATE)
${config.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## MEMORY INDEX (TIER 1 — ALWAYS LOADED)
${memoryIndex}

## CURRENT OUTPUT DOCUMENT
This is what your organization has produced so far. Your work this cycle
should improve upon it.

\`\`\`
${currentOutput}
\`\`\`
`.trim();
}

// ── JSON output instruction ─────────────────────────────────────────────
export const JSON_OUTPUT_INSTRUCTION = `
## OUTPUT FORMAT
Your response MUST contain a valid JSON object.
Wrap it in a \`\`\`json code block like this:

\`\`\`json
{
  "your": "response here"
}
\`\`\`

Do NOT include any text before or after the JSON block.
Do NOT include markdown formatting inside the JSON values.
`.trim();