TypeScript

import { Glob } from 'bun';
import { readFile } from 'node:fs/promises';

export async function localDocsSearch(query: string, root = 'memory', limit = 12) {
  const glob = new Glob('**/*.{md,txt,json}');
  const hits: Array<{ file: string; excerpt: string }> = [];

  for await (const file of glob.scan(root)) {
    const text = await readFile(`${root}/${file}`, 'utf-8').catch(() => '');
    if (!text) continue;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) continue;
    hits.push({
      file: `${root}/${file}`,
      excerpt: text.slice(Math.max(0, idx - 100), idx + 280).replace(/\s+/g, ' '),
    });
    if (hits.length >= limit) break;
  }

  return {
    summary: `Found ${hits.length} local-doc hits`,
    hits,
  };
}