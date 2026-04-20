import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { CONTRACTOR_AGENT_SYSTEM_PROMPT, ContractProposalSchema } from '@/prompts/contractor-agent.js';
import { SwarmBus } from './swarm-bus.js';
import { EconomicEngine } from './economic-engine.js';
import { ServiceDiscovery } from './service-discovery.js';

export class SwarmCoordinator {
  private bus: SwarmBus;
  private economics: EconomicEngine;
  private discovery: ServiceDiscovery;

  constructor(private runId: string) {
    this.bus = new SwarmBus(runId);
    this.economics = new EconomicEngine(runId);
    this.discovery = new ServiceDiscovery();
  }

  async evaluateDelegation(opts: {
    cycle: number;
    mission: string;
    currentOutput: string;
    transcript: string;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const proposal = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: CONTRACTOR_AGENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            runId: this.runId,
            mission: opts.mission,
            currentOutputSnippet: opts.currentOutput.slice(-5000),
            transcriptSnippet: opts.transcript.slice(-5000),
          }, null, 2),
        },
      ],
      schema: ContractProposalSchema,
    });

    if (!proposal.contract_needed || !proposal.service_key) return null;

    // Find a service provider
    const providers = await this.discovery.find(proposal.service_key);
    const provider = providers[0]; // Take best match for now

    if (!provider) {
      console.warn(`[Swarm] No provider found for service: ${proposal.service_key}`);
      return null;
    }

    const contractId = `con_${nanoid(10)}`;
    const credits = proposal.offered_credits ?? provider.unitPrice;

    // 1. Escrow credits
    await this.economics.escrow(credits, `Contract ${contractId} with ${provider.runId}`);

    // 2. Register Contract in DB
    const db = getDb();
    db.prepare(`
      INSERT INTO inter_org_contracts (id, master_run_id, contractor_run_id, service_key, budget_credits, task_payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      contractId,
      this.runId,
      provider.runId,
      proposal.service_key,
      credits,
      JSON.stringify({ 
        request_id: contractId,
        payload: proposal.task_payload_md,
        master_mission: opts.mission 
      })
    );
    db.close();

    // 3. Send Message via Swarm Bus
    await this.bus.send(provider.runId, 'request', {
      request_id: contractId,
      task: proposal.task_payload_md,
      mission: opts.mission
    });

    return { contractId, provider, credits };
  }

  async handleIncomingRequests() {
    const messages = await this.bus.pollInbox();
    for (const msg of messages) {
       if (msg.message_type === 'request') {
          console.log(`[Swarm] Received service request from ${msg.sender_run_id} for ${msg.payload.request_id}`);
          // In a real implementation, the Orchestrator would pick this up and spawn a cycle to handle it.
       }
    }
  }
}
