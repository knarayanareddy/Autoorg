TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { splitClaims } from '@/graph/citations.js';

const NODE_REF = /\[(n_[a-f0-9]{10})\]/g;

export interface ClaimValidation {
  claim: string;
  citedNodeIds: string[];
  validNodeIds: string[];
  invalidNodeIds: string[];
  status: 'grounded' | 'invalid_citation' | 'uncited';
}

export interface GroundednessReport {
  totalClaims: number;
  citedClaims: number;
  validCitedClaims: number;
  invalidCitedClaims: number;
  uncitedClaims: number;
  citationCoverage: number;
  validCoverage: number;
  invalidRefs: string[];
  uncitedExamples: string[];
  claims: ClaimValidation[];
}

function extractNodeIds(text: string): string[] {
  return [...text.matchAll(NODE_REF)].map(m => m[1]!);
}

function getValidNodeIdSet(runId: string): Set<string> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT node_id FROM graph_node_cache WHERE run_id = ?
  `).all(runId) as Array<{ node_id: string }>;
  db.close();
  return new Set(rows.map(r => r.node_id));
}

export function validateGroundednessDeterministic(
  runId: string,
  text: string
): GroundednessReport {
  const claims = splitClaims(text);
  const validNodeIds = getValidNodeIdSet(runId);

  const claimReports: ClaimValidation[] = [];

  for (const claim of claims) {
    const refs = extractNodeIds(claim);
    const validRefs = refs.filter(r => validNodeIds.has(r));
    const invalidRefs = refs.filter(r => !validNodeIds.has(r));

    let status: ClaimValidation['status'];
    if (validRefs.length > 0) {
      status = 'grounded';
    } else if (refs.length > 0) {
      status = 'invalid_citation';
    } else {
      status = 'uncited';
    }

    claimReports.push({
      claim,
      citedNodeIds: refs,
      validNodeIds: validRefs,
      invalidNodeIds: invalidRefs,
      status,
    });
  }

  const totalClaims = claimReports.length;
  const citedClaims = claimReports.filter(c => c.citedNodeIds.length > 0).length;
  const validCitedClaims = claimReports.filter(c => c.status === 'grounded').length;
  const invalidCitedClaims = claimReports.filter(c => c.status === 'invalid_citation').length;
  const uncitedClaims = claimReports.filter(c => c.status === 'uncited').length;

  const invalidRefs = [...new Set(
    claimReports.flatMap(c => c.invalidNodeIds)
  )];

  return {
    totalClaims,
    citedClaims,
    validCitedClaims,
    invalidCitedClaims,
    uncitedClaims,
    citationCoverage: totalClaims > 0 ? citedClaims / totalClaims : 0,
    validCoverage: totalClaims > 0 ? validCitedClaims / totalClaims : 0,
    invalidRefs,
    uncitedExamples: claimReports
      .filter(c => c.status === 'uncited')
      .slice(0, 8)
      .map(c => c.claim.slice(0, 180)),
    claims: claimReports,
  };
}

export function storeGroundednessReport(
  runId: string,
  cycleNumber: number,
  role: string,
  report: GroundednessReport
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO groundedness_reports
      (id, run_id, cycle_number, role, total_claims, cited_claims, valid_cited_claims,
       invalid_cited_claims, uncited_claims, valid_coverage, citation_coverage,
       invalid_refs_json, uncited_examples_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `gr_${nanoid(8)}`,
    runId,
    cycleNumber,
    role,
    report.totalClaims,
    report.citedClaims,
    report.validCitedClaims,
    report.invalidCitedClaims,
    report.uncitedClaims,
    report.validCoverage,
    report.citationCoverage,
    JSON.stringify(report.invalidRefs),
    JSON.stringify(report.uncitedExamples),
  );
  db.close();
}

export function groundednessSummaryForPrompt(report: GroundednessReport): string {
  return `
## DETERMINISTIC GROUNDEDNESS REPORT
- Total claims: ${report.totalClaims}
- Claims with any citation: ${report.citedClaims}
- Claims with valid graph citations: ${report.validCitedClaims}
- Claims with invalid citations: ${report.invalidCitedClaims}
- Uncited claims: ${report.uncitedClaims}
- Citation coverage: ${(report.citationCoverage * 100).toFixed(0)}%
- Valid grounded coverage: ${(report.validCoverage * 100).toFixed(0)}%

Invalid refs:
${report.invalidRefs.length > 0 ? report.invalidRefs.map(r => `- ${r}`).join('\n') : '[None]'}

Example uncited claims:
${report.uncitedExamples.length > 0 ? report.uncitedExamples.map(c => `- ${c}`).join('\n') : '[None]'}
`.trim();
}
3. Graph snapshots + diffs