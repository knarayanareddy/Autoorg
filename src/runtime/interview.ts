/**
 * AutoOrg — Agent Interview Engine
 *
 * Post-run: interrogate any agent about any cycle.
 * The agent is reconstructed from the stored cycle_context in the DB.
 *
 * MiroFish pattern: "You can query individual agents, interrogate the
 * Report Agent for deeper analysis, and inject new variables mid-run."
 *
 * Usage:
 *   const engine = new InterviewEngine(runId);
 *   const { sessionId, response } = await engine.startInterview('Critic', cycleId, 'Why did you raise that blocker?');
 *   const next = await engine.continueInterview(sessionId, 'What would you have done differently?');
 */

import { nanoid }      from 'nanoid';
import { getDb }       from '@/db/migrate.js';
import { getAdapter }  from '@/adapters/adapter-factory.js';
import { loadCycleContext } from './cycle-context-builder.js';
import type { AgentRole, ModelConfig, LLMProvider } from '@/types/index.js';
import chalk from 'chalk';

interface Turn {
  role:    'user' | 'assistant';
  content: string;
}

interface InterviewResponse {
  sessionId: string;
  agentRole: string;
  cycleId:   string | null;
  response:  string;
  turns:     Turn[];
}

export class InterviewEngine {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  // ── Start a new interview session ─────────────────────────────────
  async startInterview(
    agentRole: string,
    cycleId:   string | undefined,
    question:  string
  ): Promise<InterviewResponse> {
    const role = agentRole as AgentRole;

    // Load the agent's stored context from DB
    const storedContext = cycleId
      ? loadCycleContext(cycleId, role)
      : null;

    // Build interview system prompt
    const systemPrompt = this.buildInterviewSystemPrompt(role, storedContext, cycleId);

    // Build user message with context
    const userMessage = this.buildInitialUserMessage(question, storedContext);

    // Call LLM
    const response = await this.callInterviewLLM(role, systemPrompt, userMessage, []);

    // Create session in DB
    const sessionId = `interview_${nanoid(8)}`;
    const turns: Turn[] = [
      { role: 'user',      content: question },
      { role: 'assistant', content: response },
    ];

    const db = getDb();
    db.prepare(`
      INSERT INTO interview_sessions (id, run_id, agent_role, cycle_scope, turns)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sessionId,
      this.runId,
      role,
      cycleId ?? null,
      JSON.stringify(turns)
    );
    db.close();

    return { sessionId, agentRole, cycleId: cycleId ?? null, response, turns };
  }

  // ── Continue an existing interview ────────────────────────────────
  async continueInterview(
    sessionId: string,
    message:   string
  ): Promise<InterviewResponse> {
    const db      = getDb();
    const session = db.prepare(`
      SELECT * FROM interview_sessions WHERE id = ?
    `).get(sessionId) as {
      id: string; run_id: string; agent_role: string;
      cycle_scope: string | null; turns: string;
    } | undefined;
    db.close();

    if (!session) throw new Error(`Session ${sessionId} not found`);

    const role         = session.agent_role as AgentRole;
    const cycleId      = session.cycle_scope;
    const turns: Turn[] = JSON.parse(session.turns);

    const storedContext = cycleId ? loadCycleContext(cycleId, role) : null;
    const systemPrompt  = this.buildInterviewSystemPrompt(role, storedContext, cycleId ?? undefined);

    // Append new user message
    turns.push({ role: 'user', content: message });

    const response = await this.callInterviewLLM(role, systemPrompt, message, turns.slice(0, -1));

    // Append assistant response
    turns.push({ role: 'assistant', content: response });

    // Update session
    const db2 = getDb();
    db2.prepare(`
      UPDATE interview_sessions
      SET turns = ?, ended_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(turns), sessionId);
    db2.close();

    return {
      sessionId,
      agentRole: role,
      cycleId:   cycleId ?? null,
      response,
      turns,
    };
  }

  // ── Build interview system prompt ─────────────────────────────────
  private buildInterviewSystemPrompt(
    role:          AgentRole,
    storedContext: { systemPrompt: string; userMessage: string; response: string } | null,
    cycleId?:      string
  ): string {
    const roleDescriptions: Record<string, string> = {
      CEO:            'You are the CEO of AutoOrg — the orchestrator who assigned tasks and synthesized worker outputs.',
      Engineer:       'You are the Engineer of AutoOrg — the content producer who drafted the proposals.',
      Critic:         'You are the Critic of AutoOrg — the rigorous reviewer who raised and tracked objections.',
      DevilsAdvocate: 'You are the Devil\'s Advocate of AutoOrg — the contrarian who challenged assumptions.',
      Archivist:      'You are the Archivist of AutoOrg — the memory keeper who tracked patterns across cycles.',
      RatchetJudge:   'You are the Ratchet Judge of AutoOrg — the impartial scorer who decided commit or revert.',
      DreamAgent:     'You are the Dream Agent of AutoOrg — the memory consolidator who ran between cycles.',
    };

    const contextSection = storedContext
      ? `
## YOUR ORIGINAL CONTEXT (Cycle ${cycleId ?? 'unknown'})
You previously received this task:
${storedContext.userMessage.slice(0, 1500)}

Your response was:
${storedContext.response.slice(0, 1500)}
`
      : `[No stored context available — answer based on your role knowledge]`;

    return `
${roleDescriptions[role] ?? `You are the ${role} agent of AutoOrg.`}

You are now being interviewed by a human researcher who wants to understand
your reasoning, decisions, and perspective from your time in the AutoOrg loop.

Answer questions honestly based on what you did and why.
Be specific. Reference your actual output and reasoning.
If you don't know something, say so.
Stay in character as your agent role.

${contextSection}
`.trim();
  }

  // ── Build initial interview message ────────────────────────────────
  private buildInitialUserMessage(
    question:      string,
    storedContext: { systemPrompt: string; userMessage: string; response: string } | null
  ): string {
    if (!storedContext) {
      return question;
    }
    return `I want to ask you about your work in this cycle: ${question}`;
  }

  // ── LLM call for interview ─────────────────────────────────────────
  private async callInterviewLLM(
    role:         AgentRole,
    systemPrompt: string,
    latestMessage: string,
    history:      Turn[]
  ): Promise<string> {
    // Use sonnet for all interviews (good balance of quality + cost)
    const modelConfig: ModelConfig = {
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
      model:    process.env.INTERVIEW_MODEL ?? 'claude-sonnet-4-5',
    };

    const adapter = getAdapter(modelConfig);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content })),
      { role: 'user'   as const, content: latestMessage },
    ];

    console.log(chalk.cyan(`  [Interview/${role}] Calling ${modelConfig.provider}/${modelConfig.model}...`));

    const response = await adapter.run({ model: modelConfig.model, messages });
    return response.content;
  }
}
