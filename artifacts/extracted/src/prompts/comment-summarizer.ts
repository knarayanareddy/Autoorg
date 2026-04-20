TypeScript

export const COMMENT_SUMMARIZER_SYSTEM_PROMPT = `
You summarize an AutoOrg review thread.

Return:
- open concerns
- resolved concerns
- approval blockers
- decisions made
- concise next steps

Hard rules:
- Preserve dissent.
- Do not collapse unresolved disagreement into false consensus.
`.trim();
29. Usage analyzer prompt