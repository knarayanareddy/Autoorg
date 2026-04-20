TypeScript

import type { AutoOrgClientOptions, CreateHostedRunRequest, HostedRun } from './types.js';

export class AutoOrgClient {
  constructor(private opts: AutoOrgClientOptions) {}

  private async request(path: string, init?: RequestInit) {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.opts.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }

    return await res.json();
  }

  async createHostedRun(input: CreateHostedRunRequest) {
    return await this.request('/api/hosted-runs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getHostedRun(id: string): Promise<HostedRun> {
    return await this.request(`/api/hosted-runs/${id}`, {
      method: 'GET',
    });
  }

  async listTemplates() {
    return await this.request('/api/templates', { method: 'GET' });
  }

  async getBillingSummary() {
    return await this.request('/api/billing/summary', { method: 'GET' });
  }
}