TypeScript

import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { ISSUE_TRANSLATOR_SYSTEM_PROMPT, IssueTranslationSchema } from '@/prompts/issue-translator.js';

export async function translateGitHubIssueEvent(githubEventId: string, runId?: string) {
  const db = getDb();
  const event = db.prepare(`
    SELECT * FROM github_events
    WHERE id = ?
  `).get(githubEventId) as
    | { payload_json: string; repo_full_name: string | null }
    | undefined;

  if (!event) {
    db.close();
    throw new Error(`GitHub event ${githubEventId} not found`);
  }

  const payload = JSON.parse(event.payload_json);
  const issue = payload.issue;
  if (!issue) {
    db.close();
    throw new Error(`GitHub event ${githubEventId} does not contain issue payload`);
  }

  const adapter = getAdapter({
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
    model: 'claude-sonnet-4-5',
  });

  const translated = await adapter.structured({
    model: 'claude-sonnet-4-5',
    messages: [
      { role: 'system', content: ISSUE_TRANSLATOR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          repo: event.repo_full_name,
          issue_number: issue.number,
          title: issue.title,
          body: issue.body ?? '',
          labels: (issue.labels ?? []).map((x: any) => x.name ?? String(x)),
        }, null, 2),
      },
    ],
    schema: IssueTranslationSchema,
  });

  const issueTaskId = `it_${nanoid(10)}`;
  db.prepare(`
    INSERT INTO issue_tasks
    (id, github_event_id, repo_full_name, issue_number, run_id, title,
     translated_mission, acceptance_criteria_json, risk_level, source_payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    issueTaskId,
    githubEventId,
    event.repo_full_name ?? 'unknown/unknown',
    issue.number,
    runId ?? null,
    issue.title,
    translated.translated_mission,
    JSON.stringify(translated.acceptance_criteria),
    translated.risk_level,
    JSON.stringify(payload)
  );

  if (runId) {
    db.prepare(`
      INSERT INTO delegated_tasks
      (id, run_id, cycle_number, from_role, to_role, task_type, instruction, status, result_summary)
      VALUES (?, ?, 0, 'GitHub', 'CoordinatorLead', ?, ?, 'pending', ?)
    `).run(
      `task_${nanoid(10)}`,
      runId,
      translated.task_type,
      `${translated.translated_mission}\n\nAcceptance criteria:\n- ${translated.acceptance_criteria.join('\n- ')}`,
      `Translated from GitHub issue #${issue.number}`
    );
  }

  db.close();
  return { issueTaskId, translated };
}
12. PR summaries from actual git diff