TypeScript

import { getAdapter } from '@/adapters/adapter-factory.js';
import { parseStructuredOutputLenient } from '@/utils/structured-output.js';
import { z } from 'zod';
import { buildCoordinatorLeadSystemPrompt, buildCoordinatorLeadUserPrompt } from '@/prompts/coordinator-lead.js';
import { TeamManager } from './team-manager.js';
import type { ModelConfig, LLMProvider, OrgConfig } from '@/types/index.js';

const LeadAssignmentSchema = z.object({
  team_assessment: z.string(),
  assignments: z.record(z.object({
    task: z.string(),
    success_criteria: z.string(),
  })),
  escalation_watch: z.string(),
});

export type LeadAssignment = z.infer<typeof LeadAssignmentSchema>;

export class CoordinatorEngine {
  private runId: string;
  private teams: TeamManager;

  constructor(runId: string) {
    this.runId = runId;
    this.teams = new TeamManager(runId);
  }

  ensureDefaultTeams(cycleNumber: number) {
    const existing = this.teams.listTeams();
    if (existing.length > 0) return;

    this.teams.createTeam({
      name: 'Research',
      mission: 'Generate strongest grounded content and evidence-backed structure.',
      workerRoles: ['Engineer', 'Archivist'],
    }, cycleNumber);

    this.teams.createTeam({
      name: 'Quality',
      mission: 'Pressure-test, critique, and challenge assumptions.',
      workerRoles: ['Critic', 'DevilsAdvocate'],
    }, cycleNumber);
  }

  async assignTeamTasks(
    config: OrgConfig,
    cycleNumber: number,
    ceoInstruction: string,
    sharedContext: string
  ): Promise<Array<{
    teamId: string;
    teamName: string;
    assignment: LeadAssignment;
  }>> {
    this.ensureDefaultTeams(cycleNumber);

    const teams = this.teams.listTeams() as Array<{
      id: string;
      name: string;
      mission: string;
    }>;

    const model: ModelConfig = config.modelAssignments.CEO ?? {
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
      model: 'claude-sonnet-4-5',
    };

    const adapter = getAdapter(model);
    const results: Array<{
      teamId: string;
      teamName: string;
      assignment: LeadAssignment;
    }> = [];

    for (const team of teams) {
      const workerRoles = this.teams.getTeamMembers(team.id);

      const system = buildCoordinatorLeadSystemPrompt();
      const user = buildCoordinatorLeadUserPrompt({
        teamName: team.name,
        teamMission: team.mission,
        cycleNumber,
        workerRoles,
        ceoInstruction,
        context: sharedContext,
      });

      const response = await adapter.run({
        model: model.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        maxTokens: 2048,
        temperature: 0.4,
      });

      const fallback: LeadAssignment = {
        team_assessment: `${team.name} team proceeding with default assignment.`,
        assignments: Object.fromEntries(
          workerRoles.map(role => [role, {
            task: `Contribute to ${team.name} mission.`,
            success_criteria: 'Produce concrete, usable output.',
          }])
        ),
        escalation_watch: 'Escalate blockers and missing evidence.',
      };

      const parsed = parseStructuredOutputLenient(response.content, LeadAssignmentSchema, fallback);

      for (const [role, value] of Object.entries(parsed.assignments)) {
        this.teams.createDelegatedTask({
          cycleNumber,
          fromRole: 'CoordinatorLead',
          toRole: role,
          teamId: team.id,
          taskType: team.name.toLowerCase(),
          instruction: value.task,
        });
      }

      results.push({
        teamId: team.id,
        teamName: team.name,
        assignment: parsed,
      });
    }

    return results;
  }
}
6. ULTRAPLAN runtime