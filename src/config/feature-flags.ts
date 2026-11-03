import { getDb } from '@/db/migrate.js';
import type { FeatureFlag } from '@/types/index.js';

/**
 * Runtime feature flags.
 *
 * Resolution order:
 *   1. `FEATURE_<SNAKE_CASE_NAME>` env var (1/true or 0/false) — escape hatch
 *   2. `feature_flags` table (cached for 60s)
 *   3. false
 *
 * Every flag must be seeded by the migration (`src/db/migrate.ts`). A flag that
 * is read but never seeded silently evaluates to false, which is how the policy
 * engine and the unsafe-action detector ended up disabled by default. Flags
 * added here must also be added to `FALLBACK_FLAGS` in `src/db/migrate.ts`.
 */
export const KNOWN_FLAGS = [
  // Governance / hardening
  'policyEngine',
  'unsafeActionDetector',
  'toolUse',
  'provenanceChain',
  'factStore',
  'knowledgeGraph',
  'scheduler',
  'daemonMode',
  'cycleSnapshots',
  'githubIntegration',
  'constitutionLock',
  'maxCostGuard',
  'gitAuditTrail',
  // Memory / dreams
  'autoDream',
  'fullAutoDream',
  'dreamOnPlateau',
  'dreamReport',
  'memoryHealthMonitor',
  'memoryTiers',
  'autonomousMemoryRewrite',
  // Retrieval
  'semanticSearch',
  'localEmbeddings',
  'hybridSearch',
  'transcriptIndex',
  'graphRag',
  // Multi-agent / swarm
  'parallelWorkers',
  'hierarchicalSwarm',
  'coordinatorMode',
  'multiOrg',
  'crossDomainSim',
  // Planning / strategy
  'ultraplan',
  'processReflection',
  'strategicPivoting',
  // Interface / ops
  'webDashboard',
  'streamingOutput',
  'humanCheckpoint',
  'kairosDaemon',
  'agentInterviews',
  'buddyMode',
  'resultsTsv',
] as const;

const KNOWN = new Set<string>(KNOWN_FLAGS);
const warned = new Set<string>();

const cache = new Map<string, boolean>();
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 60_000;

/** `knowledgeGraph` → `FEATURE_KNOWLEDGE_GRAPH` */
export function envKeyFor(name: string): string {
  return `FEATURE_${name
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '')}`;
}

function buildCache(): void {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT flag_name, enabled FROM feature_flags`
    ).all() as Array<{ flag_name: string; enabled: number }>;
    db.close();

    cache.clear();
    for (const row of rows) {
      cache.set(row.flag_name, row.enabled === 1);
    }
    cacheBuiltAt = Date.now();
  } catch {
    // DB not ready — cache stays empty, all flags return false
  }
}

export function featureFlag(name: FeatureFlag | string): boolean {
  // Env var override takes priority: FEATURE_TOOL_USE=1
  const envVal = process.env[envKeyFor(name)];
  if (envVal === '1' || envVal === 'true') return true;
  if (envVal === '0' || envVal === 'false') return false;

  // AUTOORG_SKIP_APPROVALS shortcut
  if (
    name === 'strictApprovalBlocking' &&
    process.env.AUTOORG_SKIP_APPROVALS === '1'
  ) {
    return false;
  }

  if (!KNOWN.has(name) && !warned.has(name)) {
    warned.add(name);
    console.warn(
      `[feature-flags] Unknown flag "${name}" — it is not seeded by the ` +
      `migration, so it will always be false. Add it to KNOWN_FLAGS and ` +
      `FALLBACK_FLAGS in src/db/migrate.ts.`
    );
  }

  // Build/refresh cache
  if (Date.now() - cacheBuiltAt > CACHE_TTL_MS) {
    buildCache();
  }

  return cache.get(name) ?? false;
}

export async function loadFeatureFlags(): Promise<void> {
  buildCache();
}

export function invalidateFlagCache(): void {
  cache.clear();
  cacheBuiltAt = 0;
}
