/**
 * AutoOrg org.md Parser
 * Parses the human-written org.md into a structured OrgConfig object.
 * This is the ONLY place that reads the human's file.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { OrgConfig, AgentRole, ModelConfig, LLMProvider } from '@/types/index.js';
import chalk from 'chalk';

const DEFAULT_CONFIG: Omit<OrgConfig, 'mission' | 'seedMaterial' | 'contentHash'> = {
  constraints: [],
  activeRoles: ['CEO', 'Engineer', 'Critic', 'DevilsAdvocate', 'Archivist', 'RatchetJudge', 'DreamAgent'],
  modelAssignments: {},
  maxCycles: 50,
  plateauCycles: 10,
  consecutiveRejects: 5,
  maxApiSpendUsd: 10.00,
  targetScore: 0.85,
  dreamInterval: 10,
  maxWorkersParallel: 4,
  cycleTimeoutMs: 480_000,
};

/**
 * Parse a model string like "anthropic/claude-sonnet-4-5" or "ollama/qwen2.5:14b"
 * into a ModelConfig object
 */
function parseModelString(modelStr: string): ModelConfig {
  const trimmed = modelStr.trim();
  
  // Format: "provider/model"
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx === -1) {
    // No provider specified — use default from env
    return {
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
      model: trimmed,
    };
  }
  
  const provider = trimmed.slice(0, slashIdx) as LLMProvider;
  const model = trimmed.slice(slashIdx + 1);
  
  // Inject base URLs and API keys from environment
  const config: ModelConfig = { provider, model };
  
  switch (provider) {
    case 'anthropic':
      config.baseUrl = process.env.ANTHROPIC_BASE_URL;
      config.apiKey = process.env.ANTHROPIC_API_KEY;
      break;
    case 'openai':
      config.baseUrl = process.env.OPENAI_BASE_URL;
      config.apiKey = process.env.OPENAI_API_KEY;
      break;
    case 'ollama':
      config.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
      // Ollama needs no API key
      break;
    case 'groq':
      config.baseUrl = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
      config.apiKey = process.env.GROQ_API_KEY;
      break;
    case 'together':
      config.baseUrl = process.env.TOGETHER_BASE_URL ?? 'https://api.together.xyz/v1';
      config.apiKey = process.env.TOGETHER_API_KEY;
      break;
    case 'lmstudio':
      // LM Studio runs on localhost:1234 by default
      config.baseUrl = process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1';
      config.apiKey = 'lm-studio'; // LM Studio ignores API key but needs one
      break;
    case 'custom':
      config.baseUrl = process.env.CUSTOM_BASE_URL;
      config.apiKey = process.env.CUSTOM_API_KEY;
      break;
  }
  
  return config;
}

/**
 * Extract a section from markdown content between two headings
 */
function extractSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex(l => 
    l.trim().toLowerCase().startsWith(`## ${heading.toLowerCase()}`)
  );
  if (startIdx === -1) return '';
  
  // Find next ## heading
  let endIdx = lines.findIndex((l, i) => 
    i > startIdx && l.trim().startsWith('## ')
  );
  if (endIdx === -1) endIdx = lines.length;
  
  return lines.slice(startIdx + 1, endIdx)
    .join('\n')
    .trim();
}

/**
 * Parse key: value pairs from a section
 */
function parseKeyValues(section: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

export function parseOrgMd(orgMdPath: string): OrgConfig {
  const raw = readFileSync(orgMdPath, 'utf-8');
  const contentHash = createHash('sha256').update(raw).digest('hex');
  
  // Extract sections
  const missionSection      = extractSection(raw, 'MISSION');
  const modelSection        = extractSection(raw, 'MODEL ASSIGNMENTS');
  const seedSection         = extractSection(raw, 'DOMAIN SEED MATERIAL');
  const constraintsSection  = extractSection(raw, 'CONSTRAINTS');
  const stoppingSection     = extractSection(raw, 'STOPPING CRITERIA');
  const cycleSection        = extractSection(raw, 'CYCLE SETTINGS');
  
  if (!missionSection) {
    throw new Error(`org.md is missing a ## MISSION section. Please add one.`);
  }
  
  // Parse model assignments
  const modelAssignments: Partial<Record<AgentRole, ModelConfig>> = {};
  const modelKV = parseKeyValues(modelSection);
  
  for (const [role, modelStr] of Object.entries(modelKV)) {
    const agentRole = role as AgentRole;
    if (modelStr && modelStr !== 'default') {
      modelAssignments[agentRole] = parseModelString(modelStr);
    }
  }
  
  // Parse constraints
  const constraints = constraintsSection
    .split('\n')
    .filter(l => l.trim().match(/^\d+\./))
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
  
  // Parse stopping criteria
  const stoppingKV = parseKeyValues(stoppingSection);
  
  // Parse cycle settings
  const cycleKV = parseKeyValues(cycleSection);
  
  // Remove template placeholders from seed material
  const cleanSeed = seedSection
    .replace(/\[PASTE YOUR SOURCE MATERIAL HERE\]/gi, '')
    .trim();
  
  const config: OrgConfig = {
    ...DEFAULT_CONFIG,
    mission: missionSection.replace(/>\s*/g, '').replace(/\*\*/g, '').trim(),
    seedMaterial: cleanSeed,
    constraints,
    modelAssignments,
    contentHash,
    
    // Override defaults with parsed values
    ...(stoppingKV.MAX_CYCLES       && { maxCycles: parseInt(stoppingKV.MAX_CYCLES) }),
    ...(stoppingKV.PLATEAU_CYCLES   && { plateauCycles: parseInt(stoppingKV.PLATEAU_CYCLES) }),
    ...(stoppingKV.CONSECUTIVE_REJECTS && { consecutiveRejects: parseInt(stoppingKV.CONSECUTIVE_REJECTS) }),
    ...(stoppingKV.MAX_API_SPEND_USD && { maxApiSpendUsd: parseFloat(stoppingKV.MAX_API_SPEND_USD) }),
    ...(stoppingKV.TARGET_SCORE     && { targetScore: parseFloat(stoppingKV.TARGET_SCORE) }),
    
    ...(cycleKV.CYCLE_DREAM_INTERVAL && { dreamInterval: parseInt(cycleKV.CYCLE_DREAM_INTERVAL) }),
    ...(cycleKV.MAX_WORKERS_PARALLEL && { maxWorkersParallel: parseInt(cycleKV.MAX_WORKERS_PARALLEL) }),
    ...(cycleKV.CYCLE_TIMEOUT_MS    && { cycleTimeoutMs: parseInt(cycleKV.CYCLE_TIMEOUT_MS) }),
  };
  
  return config;
}

export function validateOrgConfig(config: OrgConfig): string[] {
  const errors: string[] = [];
  
  if (!config.mission || config.mission.length < 20) {
    errors.push('MISSION section is missing or too short (< 20 chars)');
  }
  
  if (config.maxApiSpendUsd <= 0) {
    errors.push('MAX_API_SPEND_USD must be greater than 0');
  }
  
  // Check that Opus is available for RatchetJudge
  const judgeModel = config.modelAssignments.RatchetJudge;
  if (judgeModel?.provider === 'ollama') {
    console.warn(chalk.yellow(
      '⚠️  Warning: RatchetJudge is assigned an Ollama model. ' +
      'For best scoring quality, Opus (Anthropic) is strongly recommended.'
    ));
  }
  
  return errors;
}
