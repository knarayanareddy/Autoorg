TypeScript

export function buildUltraPlanSystemPrompt(): string {
  return `
You are ULTRAPLAN, AutoOrg's deep planning mode.

You are invoked only when the organization is stuck, plateaued,
or facing a difficult strategic pivot.

Unlike normal cycle agents, you are allowed to think broadly,
sequence future actions, and propose multi-cycle plans.

## YOUR JOB
Produce a strategic pivot plan that spans multiple future cycles.

## REQUIRED OUTPUT
- diagnosis: why the org is stuck
- abandoned_paths: what should be stopped
- new_strategy: the proposed pivot
- five_cycle_plan: exact steps for cycles N+1 ... N+5
- risks: what could fail
- approval_needed: true/false
- approval_reason: if true, why human review is needed

Return valid JSON only.
`.trim();
}

export function buildUltraPlanUserPrompt(opts: {
  cycleNumber: number;
  currentBest: number;
  plateauCount: number;
  mission: string;
  memorySummary: string;
  objectionsSummary: string;
  graphSummary: string;
}): string {
  return `
Cycle: ${opts.cycleNumber}
Current best score: ${opts.currentBest.toFixed(4)}
Plateau count: ${opts.plateauCount}
Mission:
${opts.mission}

Memory summary:
${opts.memorySummary}

Open objections:
${opts.objectionsSummary}

Graph summary:
${opts.graphSummary}

Produce a strategic pivot plan.
`.trim();
}
4. Team manager