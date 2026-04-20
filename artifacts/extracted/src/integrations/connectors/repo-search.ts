TypeScript

import { $ } from 'bun';

export async function repoSearchConnector(query: string, cwd = process.cwd(), limit = 20) {
  const cmd = `rg -n --hidden --glob '!node_modules' --glob '!.git' ${JSON.stringify(query)} ${JSON.stringify(cwd)}`;
  const raw = await $`${['bash', '-lc', cmd]}`.text().catch(() => '');
  const lines = raw
    .split('\n')
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => {
      const first = line.indexOf(':');
      const second = line.indexOf(':', first + 1);
      return {
        file: line.slice(0, first),
        line: Number(line.slice(first + 1, second)),
        text: line.slice(second + 1),
      };
    });

  return {
    summary: `Found ${lines.length} repo matches for "${query}"`,
    lines,
  };
}