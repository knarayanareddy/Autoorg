/**
 * Dependency audit gate.
 *
 * Wraps `bun audit` so CI fails when a vulnerability at or above
 * AUDIT_FAIL_ON (default: high) is present. Moderate/low findings are
 * reported but do not fail the build — a slow-moving advisory should not
 * block every commit, while criticals and highs must be fixed (or
 * explicitly allowlisted below WITH a written reason).
 *
 * Added after the first red-team exercise found 24 vulnerabilities
 * (2 critical, including two in simple-git — a direct dependency sitting
 * on the commit path) with no audit tooling at all.
 */
import { spawnSync } from 'node:child_process';

export interface AuditFinding {
  pkg: string;      // package name without version
  severity: string; // critical | high | moderate | low
  title: string;
}

/** Packages that may remain at/above the fail threshold, with justification. */
export const AUDIT_ALLOWLIST: Array<{ pkg: string; reason: string }> = [];

const RANK: Record<string, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

const PKG_HEADER = /^((?:@[^/\s]+\/)?[^@\s]+)@\S/;
const SEVERITY_LINE = /^\s+(critical|high|moderate|low):\s+(.+)$/;

/** Parse `bun audit` text output into structured findings. */
export function parseAuditFindings(output: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  let currentPkg = 'unknown';
  for (const line of output.split('\n')) {
    const header = PKG_HEADER.exec(line);
    if (header && !line.startsWith(' ')) {
      currentPkg = header[1]!;
      continue;
    }
    const sev = SEVERITY_LINE.exec(line);
    if (sev) {
      findings.push({ pkg: currentPkg, severity: sev[1]!, title: sev[2]! });
    }
  }
  return findings;
}

/** Decide which findings block the build. */
export function evaluateFindings(
  findings: AuditFinding[],
  failOn: string,
  allowlist: Array<{ pkg: string; reason: string }> = AUDIT_ALLOWLIST
): { blocked: AuditFinding[]; allowed: AuditFinding[] } {
  const threshold = RANK[failOn] ?? RANK.high!;
  const allowedPkgs = new Set(allowlist.map(a => a.pkg));
  const blocked: AuditFinding[] = [];
  const allowed: AuditFinding[] = [];
  for (const f of findings) {
    if ((RANK[f.severity] ?? 0) < threshold) continue;
    if (allowedPkgs.has(f.pkg)) allowed.push(f);
    else blocked.push(f);
  }
  return { blocked, allowed };
}

/** Fail closed if bun could not audit or its output is not understood. */
export function validateAuditResult(status: number | null, output: string, error?: Error): boolean {
  if (error || status === null) return false;
  const findings = parseAuditFindings(output);
  if (status === 0) return findings.length === 0 && /No vulnerabilities found/i.test(output);
  const summary = output.match(/(?:^|\n)(\d+) vulnerabilit(?:y|ies) \(/);
  return status === 1 && !!summary && Number(summary[1]) === findings.length && findings.length > 0;
}

function main(): void {
  const failOn = (process.env.AUDIT_FAIL_ON ?? 'high').toLowerCase();
  const res = spawnSync('bun', ['audit'], { encoding: 'utf8' });
  const output = (res.stdout ?? '') + (res.stderr ?? '');

  if (!validateAuditResult(res.status, output, res.error)) {
    console.error('❌ Dependency audit could not be verified:', res.error?.message ?? output);
    process.exit(1);
  }

  // bun audit exits non-zero when anything is found; severity decides here.
  const findings = parseAuditFindings(output);
  const { blocked, allowed } = evaluateFindings(findings, failOn);

  if (findings.length === 0) {
    console.log('✅ Dependency audit: no vulnerabilities found.');
    return;
  }

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  console.log(
    'Dependency audit findings: ' +
      [...counts.entries()].map(([s, n]) => `${n} ${s}`).join(', ')
  );
  for (const f of allowed) {
    console.log(`  ⚠ allowlisted ${f.pkg} (${f.severity}): ${f.title}`);
  }
  if (blocked.length > 0) {
    console.error(`❌ Dependency audit: ${blocked.length} finding(s) at/above '${failOn}':`);
    for (const f of blocked) console.error(`  - ${f.pkg} (${f.severity}) ${f.title}`);
    console.error("Fix with 'bun audit fix' / a version bump, or add an allowlist entry with a reason.");
    process.exit(1);
  }
  console.log(`✅ Dependency audit: ${allowed.length} allowlisted finding(s), none above threshold.`);
}

// Run only as a script (tests import the pure functions above).
if (import.meta.main) main();
