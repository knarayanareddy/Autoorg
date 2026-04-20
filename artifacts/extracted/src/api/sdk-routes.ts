TypeScript

// Thin wrapper: re-use workspace/template/billing routes for SDK callers.
// This file mainly exists so Phase 9 keeps public API concerns explicit.

export async function handleSdkRoutes(url: URL, req: Request) {
  // Reserved namespace if you want versioned SDK-only endpoints later:
  // /api/sdk/v1/...
  return null;
}
26. Daemon / scheduler platform integration
Patch src/runtime/daemon.ts
Add:

TypeScript

import { RemoteAgentService } from '@/platform/remote-agent.js';
import { HostedRunner } from '@/platform/hosted-runner.js';
import { RetentionManager } from '@/platform/retention-manager.js';
import { ObservabilityService } from '@/platform/observability.js';
Inside daemon tick:

TypeScript

const agents = new RemoteAgentService();
const retention = new RetentionManager();
const observability = new ObservabilityService();

// periodically
agents.sweepOffline();
await retention.enforce();
observability.snapshotPlatform();
If this daemon is also acting as a local hosted-run worker:

TypeScript

const localAgent = agents.register({
  agentName: process.env.AUTOORG_INSTANCE_NAME ?? 'local-daemon',
  deploymentMode: (process.env.AUTOORG_DEPLOYMENT_MODE as any) ?? 'local',
});

setInterval(async () => {
  const claimed = agents.claimWork(localAgent.agentId);
  if (!claimed) return;

  try {
    const request = JSON.parse(claimed.request_json || '{}');

    // dispatch based on hosted run mode
    // use your already-existing real orchestrator / portfolio / benchmark entrypoints
    let result: any;

    if (claimed.mode === 'portfolio') {
      result = await runHostedPortfolio(request, claimed.workspace_id);
    } else if (claimed.mode === 'benchmark') {
      result = await runHostedBenchmark(request, claimed.workspace_id);
    } else {
      result = await runHostedSingleOrg(request, claimed.workspace_id);
    }

    const hosted = new HostedRunner();
    hosted.complete({
      hostedRunId: claimed.id,
      autoorgRunRef: result.runId,
      portfolioRunRef: result.portfolioRunId,
      outputArtifactPath: result.outputArtifactPath,
      reportArtifactPath: result.reportArtifactPath,
    });
  } catch (error) {
    const hosted = new HostedRunner();
    hosted.fail(claimed.id, error instanceof Error ? error.message : String(error));
  } finally {
    agents.markIdle(localAgent.agentId);
  }
}, 3000);
27. Orchestrator workspace scoping
Patch src/runtime/orchestrator.ts
Make all path-sensitive operations respect workspaceRoot.

At run bootstrap:

TypeScript

const root = config.workspaceRoot ?? process.cwd();
Then replace direct path assumptions like:

TypeScript

path.join(process.cwd(), 'workspace', 'current_output.md')
with:

TypeScript

path.join(root, 'workspace', 'current_output.md')
and similarly for:

memory/
artifacts/
results.tsv
transcripts/
This is essential for Phase 9 because hosted runs must operate inside the correct tenant workspace.

28. Comments summarizer prompt