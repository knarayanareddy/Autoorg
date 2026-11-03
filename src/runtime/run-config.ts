import { RedactionFilter } from './redaction.js';

const SECRET_FIELD = /^(?:api[_-]?key|authorization|password|secret|token|access[_-]?token)$/i;
/** A copy for persistence/broadcast, never the live config passed to adapters. */
export function sanitizeRunConfig<T>(config: T): T {
  const explicit = new Set<string>();
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(collect); return; }
    if (!v || typeof v !== 'object') return;
    for (const [key, value] of Object.entries(v)) {
      if (SECRET_FIELD.test(key) && typeof value === 'string' && value) explicit.add(value);
      else collect(value);
    }
  };
  collect(config);
  const clean = (v: unknown): unknown => {
    if (typeof v === 'string') {
      let text = v;
      for (const secret of [...explicit].sort((a, b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]');
      return RedactionFilter.redactOnly(text).text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');
    }
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([key, value]) => [key, SECRET_FIELD.test(key) && value != null ? '[REDACTED]' : clean(value)]));
    return v;
  };
  return clean(config) as T;
}
