export interface AutoOrgOptions {
  baseUrl: string;
  apiKey: string;
}

export interface RunRequest {
  workspaceId: string;
  missionText: string;
  mode?: 'single_org' | 'portfolio' | 'benchmark';
}

export class AutoOrgClient {
  constructor(private opts: AutoOrgOptions) {}

  private async request(path: string, body?: any) {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.opts.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      throw new Error(`AutoOrg API Error: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  async submitRun(req: RunRequest) {
    return this.request('/api/hosted-runs', {
      workspaceId: req.workspaceId,
      mode: req.mode || 'single_org',
      request: { missionText: req.missionText }
    });
  }

  async getRunStatus(runId: string) {
    return this.request(`/api/hosted-runs/${runId}`);
  }

  async listWorkspaces() {
    return this.request('/api/workspaces');
  }
}
