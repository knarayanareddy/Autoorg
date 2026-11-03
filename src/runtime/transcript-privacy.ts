/** Full transcript content is opt-in because unknown secrets cannot be detected reliably. */
export function transcriptContentEnabled(): boolean {
  return process.env.AUTOORG_TRANSCRIPT_CONTENT === '1';
}
export const OMITTED_TRANSCRIPT_CONTENT = '[CONTENT OMITTED]';
const ACTIONS = new Set(['prompt', 'response', 'score', 'cycle_start', 'commit', 'revert', 'error', 'awaiting_approval']);
export function safeTranscriptAction(action: string): string { return ACTIONS.has(action) ? action : 'other'; }
