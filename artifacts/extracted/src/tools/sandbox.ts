TypeScript

import { spawn } from 'node:child_process';

const DEFAULT_ALLOWED_PREFIXES = [
  'bun test',
  'bun run',
  'node ',
  'python ',
  'pytest',
  'tsc',
  'eslint',
  'prettier',
  'cat ',
  'ls',
  'pwd',
  'git diff',
  'git status',
];

export class Sandbox {
  private allowed = (process.env.SANDBOX_ALLOWED_PREFIXES?.split(',').map(x => x.trim()).filter(Boolean))
    || DEFAULT_ALLOWED_PREFIXES;

  async exec(command: string, opts: { cwd: string; timeoutMs: number }) {
    if (!this.allowed.some(prefix => command === prefix || command.startsWith(prefix + ' '))) {
      throw new Error(`Command not allowlisted: ${command}`);
    }

    return await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const child = spawn('bash', ['-lc', command], {
        cwd: opts.cwd,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Sandbox timeout after ${opts.timeoutMs}ms`));
      }, opts.timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: stdout.slice(0, 20_000),
          stderr: stderr.slice(0, 20_000),
          exitCode: code ?? -1,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
7. Tool runner