import { getDb } from '@/db/migrate.js';
import { LearningOrchestrator } from '@/learning/learning-orchestrator.js';
import { ReleaseGate } from '@/learning/release-gate.js';

export async function handleLearningRoutes(url: URL, req: Request) {
  const method = req.method;

  // List Proposals
  if (url.pathname === '/api/learning/proposals' && method === 'GET') {
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.*, v.content as candidate_content 
      FROM improvement_proposals p
      LEFT JOIN prompt_versions v ON v.proposal_id = p.id
      ORDER BY p.created_at DESC
    `).all();
    db.close();
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  }

  // Trigger Learning Cycle
  if (url.pathname === '/api/learning/cycle' && method === 'POST') {
    const orchestrator = new LearningOrchestrator();
    const result = await orchestrator.runCycle({});
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  }

  // Approve/Release Proposal
  if (url.pathname.startsWith('/api/learning/proposals/') && url.pathname.endsWith('/release') && method === 'POST') {
    const proposalId = url.pathname.split('/')[4];
    const gate = new ReleaseGate();
    const result = await gate.release(proposalId);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  }

  return null;
}
