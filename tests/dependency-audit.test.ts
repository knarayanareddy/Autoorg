/**
 * Dependency audit gate (red-team R1): parse + threshold + allowlist logic.
 * The gate itself shells out to `bun audit`; these tests pin the decisions.
 */
import { describe, expect, test } from 'bun:test';
import { parseAuditFindings, evaluateFindings } from '../scripts/ci/dependency-audit.js';

const SAMPLE = `
simple-git@3.36.0
  (direct dependency)
  critical: simple-git unsafe-operation guard does not block trailer command configuration (>=3.15.0 <4.0.1) - https://example/a
  high: simple-git allows command execution through unblocked Git configuration includes (<=3.36.0) - https://example/b

brace-expansion@2.1.0
  glob > minimatch > brace-expansion
  moderate: brace-expansion: Quadratic-time expansion - https://example/c

left-pad@1.0.0
  low: cosmetic issue - https://example/d

2 vulnerabilities (1 critical, 1 high)
`;

describe('dependency audit gate', () => {
  test('parses package headers and severity lines', () => {
    const findings = parseAuditFindings(SAMPLE);
    expect(findings).toHaveLength(4);
    expect(findings[0]).toMatchObject({ pkg: 'simple-git', severity: 'critical' });
    expect(findings[2]).toMatchObject({ pkg: 'brace-expansion', severity: 'moderate' });
    expect(findings[3]).toMatchObject({ pkg: 'left-pad', severity: 'low' });
  });

  test('empty output yields no findings (bun audit "No vulnerabilities found")', () => {
    expect(parseAuditFindings('No vulnerabilities found (checked 125 packages)')).toHaveLength(0);
  });

  test('default threshold (high) blocks critical and high, passes moderate/low', () => {
    const { blocked, allowed } = evaluateFindings(parseAuditFindings(SAMPLE), 'high');
    expect(blocked.map(f => f.pkg)).toEqual(['simple-git', 'simple-git']);
    expect(allowed).toHaveLength(0);
  });

  test('allowlisted package is downgraded, others still block', () => {
    const { blocked, allowed } = evaluateFindings(parseAuditFindings(SAMPLE), 'high', [
      { pkg: 'simple-git', reason: 'pinned upstream, fix pending' },
    ]);
    expect(blocked).toHaveLength(0);
    expect(allowed).toHaveLength(2);
  });

  test('moderate threshold blocks everything above moderate', () => {
    const { blocked } = evaluateFindings(parseAuditFindings(SAMPLE), 'moderate');
    expect(blocked.map(f => f.severity)).toEqual(['critical', 'high', 'moderate']);
  });
});
