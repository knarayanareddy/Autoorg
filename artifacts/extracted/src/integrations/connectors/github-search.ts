TypeScript

import { GitHubClient } from '@/integrations/github.js';

export async function githubSearchConnector(opts: {
  repo?: string;
  query: string;
  type?: 'issues' | 'prs';
  limit?: number;
}) {
  const gh = new GitHubClient();
  const items = await gh.searchIssues({
    q: [opts.query, opts.repo ? `repo:${opts.repo}` : '', opts.type === 'prs' ? 'is:pr' : 'is:issue']
      .filter(Boolean)
      .join(' '),
    per_page: opts.limit ?? 10,
  });

  return {
    summary: `GitHub search returned ${items.items?.length ?? 0} results`,
    items: (items.items ?? []).map((x: any) => ({
      number: x.number,
      title: x.title,
      url: x.html_url,
      state: x.state,
      body: (x.body ?? '').slice(0, 400),
    })),
  };
}
5. Tool manifests