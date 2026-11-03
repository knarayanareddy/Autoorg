import { spawn } from 'node:child_process';
import { RedactionFilter } from '@/runtime/redaction.js';

export interface RepoSearchHit {
  file: string;
  line: number;
  text: string;
}

export async function repoSearchConnector(query: string, cwd: string = process.cwd(), limit: number = 20): Promise<{ summary: string; lines: RepoSearchHit[] }> {
  const includeContent = process.env.AUTOORG_REPO_SEARCH_CONTENT === '1';
  return new Promise((resolve) => {
    // Basic ripgrep command
    const child = spawn('rg', ['-n', '--hidden', '--glob', '!node_modules', '--glob', '!.git', '--', query, cwd]);
    
    const maxBytes = 1024 * 1024;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.trunc(limit), 100)) : 20;
    let stdout = '';
    let bytes = 0;
    let failure = '';
    const timer = setTimeout(() => { failure = 'Search timed out'; child.kill(); }, 10000);
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > maxBytes) {
        failure = 'Search output exceeded size limit';
        child.kill();
        return;
      }
      stdout += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure || (code !== 0 && code !== 1)) {
        resolve({ summary: failure || 'Search failed', lines: [] });
        return;
      }
      const hits = stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, safeLimit)
        .map((line) => {
          const first = line.indexOf(':');
          const second = line.indexOf(':', first + 1);
          if (first === -1 || second === -1) return null as any;

          return {
            file: includeContent ? RedactionFilter.redactOnly(line.slice(0, first)).text : '[PATH OMITTED]',
            line: Number(line.slice(first + 1, second)),
            // Ripgrep returns raw file content: any credential in a working
            // file (not hidden by .gitignore) would land verbatim in agent
            // context. Redact at the connector so every caller is safe.
            text: includeContent ? RedactionFilter.redactOnly(line.slice(second + 1)).text : '[CONTENT OMITTED]',
          };
        })
        .filter(Boolean);

      resolve({
        summary: includeContent ? `Found ${hits.length} repo matches for "${RedactionFilter.redactOnly(query).text}"` : `Found ${hits.length} repo matches (content omitted)`,
        lines: hits,
      });
    });

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ summary: includeContent ? `Search failed for "${RedactionFilter.redactOnly(query).text}"` : `Search failed`, lines: [] });
    });
  });
}
