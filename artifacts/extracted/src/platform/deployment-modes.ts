TypeScript

export type DeploymentMode = 'local' | 'single-node' | 'cloud-worker' | 'managed';

export function currentDeploymentMode(): DeploymentMode {
  const raw = (process.env.AUTOORG_DEPLOYMENT_MODE ?? 'local').toLowerCase();
  if (raw === 'single-node' || raw === 'cloud-worker' || raw === 'managed') return raw;
  return 'local';
}

export function deploymentCapabilities(mode: DeploymentMode) {
  switch (mode) {
    case 'local':
      return { remoteAgents: false, managedBackups: false, tenantScale: 'low' };
    case 'single-node':
      return { remoteAgents: true, managedBackups: false, tenantScale: 'medium' };
    case 'cloud-worker':
      return { remoteAgents: true, managedBackups: true, tenantScale: 'high' };
    case 'managed':
      return { remoteAgents: true, managedBackups: true, tenantScale: 'very_high' };
  }
}
18. SDK token scopes