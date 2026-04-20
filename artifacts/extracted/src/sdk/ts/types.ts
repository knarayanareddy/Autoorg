TypeScript

export interface AutoOrgClientOptions {
  baseUrl: string;
  apiKey: string;
}

export interface CreateHostedRunRequest {
  workspaceId: string;
  mode: 'single_org' | 'portfolio' | 'benchmark' | 'daemon';
  request: Record<string, unknown>;
}

export interface HostedRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  output_artifact_path?: string | null;
  report_artifact_path?: string | null;
}