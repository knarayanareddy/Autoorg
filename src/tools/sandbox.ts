import { spawn } from 'node:child_process';
import { featureFlag } from '@/config/feature-flags.js';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class Sandbox {
  private mode: 'bun' | 'docker';

  constructor() {
    this.mode = process.env.SANDBOX_MODE === 'docker' ? 'docker' : 'bun';
  }

  async run(command: string, opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}): Promise<SandboxResult> {
    if (this.mode === 'docker') {
      return this.runDocker(command, opts);
    }
    return this.runBun(command, opts);
  }

  private async runBun(command: string, opts: any): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, ...opts.env },
        timeout: opts.timeout ?? 30000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => stderr += d);

      child.on('close', code => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });

      child.on('error', err => {
        resolve({ stdout, stderr: `${stderr}\n${err.message}`, exitCode: 1 });
      });
    });
  }

  private async runDocker(command: string, opts: any): Promise<SandboxResult> {
    // Hard isolation via Docker (requires docker to be installed on host)
    // We mount the CWD into /workspace
    const cwd = opts.cwd ?? process.cwd();
    const dockerCmd = [
      'run', '--rm', 
      '-v', `${cwd}:/workspace`,
      '-w', '/workspace',
      'node:20-slim',
      'bash', '-c', command
    ];

    return new Promise((resolve) => {
      const child = spawn('docker', dockerCmd, { timeout: opts.timeout ?? 60000 });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => stderr += d);

      child.on('close', code => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });

      child.on('error', err => {
        resolve({ stdout, stderr: `${stderr}\nDocker failed: ${err.message}`, exitCode: 1 });
      });
    });
  }
}

export const sandbox = new Sandbox();
