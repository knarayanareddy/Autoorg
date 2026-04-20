const GITHUB_API = process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com';

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured in .env');
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'AutoOrg-Phase5',
  };
}

export class GitHubClient {
  async getRepo(repoFullName: string) {
    const res = await fetch(`${GITHUB_API}/repos/${repoFullName}`, {
      headers: githubHeaders(),
    });
    if (!res.ok) throw new Error(`GitHub repo fetch failed: ${res.status}`);
    return res.json();
  }

  async listOpenIssues(repoFullName: string) {
    const res = await fetch(`${GITHUB_API}/repos/${repoFullName}/issues?state=open`, {
      headers: githubHeaders(),
    });
    if (!res.ok) throw new Error(`GitHub issues fetch failed: ${res.status}`);
    return res.json();
  }

  async createPullRequest(opts: {
    repoFullName: string;
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  }) {
    const res = await fetch(`${GITHUB_API}/repos/${opts.repoFullName}/pulls`, {
      method: 'POST',
      headers: githubHeaders(),
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        head: opts.head,
        base: opts.base,
        draft: opts.draft ?? true,
      }),
    });
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`GitHub PR create failed: ${res.status} - ${error}`);
    }
    return res.json();
  }

  async createIssueComment(repoFullName: string, issueNumber: number, body: string) {
    const res = await fetch(`${GITHUB_API}/repos/${repoFullName}/issues/${issueNumber}/comments`, {
      method: 'POST',
      headers: githubHeaders(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`GitHub comment create failed: ${res.status}`);
    return res.json();
  }
}
