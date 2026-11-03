import { spawn } from 'node:child_process';
import { RedactionFilter } from '@/runtime/redaction.js';

export interface RepoSearchHit {
  file: string;
  line: number;
  text: string;
}

export async function repoSearchConnector(query: string, cwd: string = process.cwd(), limit: number = 20): Promise<{ summary: string; lines: RepoSearchHit[] }> {
  return new Promise((resolve) => {
    // Basic ripgrep command
    const child = spawn('rg', ['-n', '--hidden', '--glob', '!node_modules', '--glob', '!.git', '--', query, cwd]);
    
    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', () => {
      const hits = stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, limit)
        .map((line) => {
          const first = line.indexOf(':');
          const second = line.indexOf(':', first + 1);
          if (first === -1 || second === -1) return null as any;

          return {
            file: RedactionFilter.redactOnly(line.slice(0, first)).text,
            line: Number(line.slice(first + 1, second)),
            // Ripgrep returns raw file content: any credential in a working
            // file (not hidden by .gitignore) would land verbatim in agent
            // context. Redact at the connector so every caller is safe.
            text: RedactionFilter.redactOnly(line.slice(second + 1)).text,
          };
        })
        .filter(Boolean);

      resolve({
        summary: `Found ${hits.length} repo matches for "${RedactionFilter.redactOnly(query).text}"`,
        lines: hits,
      });
    });

    child.on('error', () => {
      resolve({ summary: `Search failed for "${RedactionFilter.redactOnly(query).text}"`, lines: [] });
    });
  });
}
