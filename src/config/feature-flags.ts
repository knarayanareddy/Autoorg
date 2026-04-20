import { getDb } from '@/db/migrate.js';
import type { FeatureFlag } from '@/types/index.js';

// In-process cache — refreshed every 60 seconds
const cache = new Map<string, boolean>();
let cacheBuiltAt = 0;
const CACHE_TTL_MS = 60_000;

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
  // Env var override takes priority: FEATURE_TOOL_USE=1 or FEATURE_TOOL_USE=0
  const envKey = `FEATURE_${name
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '')}`;
  const envVal = process.env[envKey];
  if (envVal === '1' || envVal === 'true') return true;
  if (envVal === '0' || envVal === 'false') return false;

  // AUTOORG_SKIP_APPROVALS shortcut
  if (
    name === 'strictApprovalBlocking' &&
    process.env.AUTOORG_SKIP_APPROVALS === '1'
  ) {
    return false;
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
