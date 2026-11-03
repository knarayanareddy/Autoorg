import { spawn } from 'node:child_process';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * OWASP A10: `sandbox.exec` ran `bash -c <agent command>` with the full host
 * environment, so sandboxed code could read every provider key, the API key
 * and the signing secret — and could escalate/destroy with `sudo`, `rm -rf /`,
 * `curl | sh`, `git push`, …
 *
 * Two guards, both applied before anything is spawned:
 *   1. `findDeniedCommand()` — a denylist of destructive/exfiltrating commands.
 *   2. `scrubbedSandboxEnv()` — an explicit allowlist of harmless variables;
 *      nothing else from `process.env` crosses into the child.
 */
const COMMAND_DENYLIST: Array<{ label: string; pattern: RegExp }> = [
  { label: 'privilege escalation (sudo)',  pattern: /(^|[\s;&|(`])sudo(\s|$)/ },
  { label: 'privilege escalation (su)',    pattern: /(^|[\s;&|(`])su\s/ },
  { label: 'privilege escalation (doas)',  pattern: /(^|[\s;&|(`])doas(\s|$)/ },
  { label: 'privilege escalation (pkexec)',pattern: /(^|[\s;&|(`])pkexec(\s|$)/ },
  {
    label: 'recursive delete of system/home paths',
    pattern: /\brm\s+(?:-{1,2}[A-Za-z-]+\s+)*(?:\/(?:etc|var|usr|bin|boot|root|home|srv|opt|lib|proc|sys|dev)(?:\/\S*)?|~(?:\/\S*)?|\$HOME(?:\/\S*)?|\/|\*|\.)(?=\s|$|;|&)/,
  },
  { label: 'disk formatter (mkfs)',        pattern: /\bmkfs(\.\w+)?(\s|$)/ },
  { label: 'raw device write (dd)',        pattern: /\bdd\s+[^;&|]*\bof=\/dev\// },
  { label: 'system shutdown',              pattern: /(^|[\s;&|(`])(shutdown|reboot|poweroff|halt)(\s|$)/ },
  { label: 'fork bomb',                    pattern: /:\(\)\s*\{[^}]*\|[^}]*&[^}]*\}/ },
  { label: 'fetch-pipe-exec (sh)',         pattern: /\|\s*(?:sudo\s+)?(?:\/usr\/bin\/)?(?:ba|z|k|da)?sh(\s|$)/ },
  { label: 'fetch-pipe-exec (interpreter)',pattern: /\|\s*(?:sudo\s+)?(?:python3?|perl|ruby)(\s|$)/ },
  { label: 'credential file access (.env)',pattern: /\.env\b/ },
  { label: 'shadow/passwd file access',    pattern: /\/etc\/(shadow|passwd|gshadow)(\s|$)/ },
  { label: 'outbound shell (ssh/scp)',     pattern: /(^|[\s;&|(`])(ssh|scp|sftp)(\s|$)/ },
  { label: 'publish/exfiltration (git push)', pattern: /\bgit\s+(?:-{1,2}\S+\s+)*push(\s|$)/ },
  { label: 'publish/exfiltration (registry)', pattern: /(^|[\s;&|(`])(npm|yarn|pnpm)\s+(?:\S+\s+)*publish(\s|$)|\bdocker\s+push(\s|$)|\btwine\s+upload(\s|$)/ },
  { label: 'world-writable system path',   pattern: /\bchmod\s+(?:-\S+\s+)*(?:[0-7]{3,4}\s+)+\/(?:etc|usr|var|bin|boot|root|home)(?=\/|\s|$)/ },
  { label: 'write to system paths',        pattern: /(>|>>)\s*\/(?:etc|usr\/bin|var\/crontab|boot|root)\// },
];

/** Returns a human-readable denial reason, or null when the command may run. */
export function findDeniedCommand(command: string): string | null {
  for (const { label, pattern } of COMMAND_DENYLIST) {
    if (pattern.test(command)) {
      return `blocked by command denylist: ${label}`;
    }
  }
  return null;
}

/**
 * Variables that may cross into the sandbox. Everything else — provider API
 * keys, AUTOORG_*, webhook secrets, cloud credentials — stays on the host.
 * Caller-supplied extras are filtered through the same allowlist.
 */
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'TMPDIR', 'USER', 'LOGNAME',
]);

export function scrubbedSandboxEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (ENV_ALLOWLIST.has(key) && value !== undefined) env[key] = value;
  }
  return env;
}

const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Bound combined output and terminate the process group on timeout or overflow. */
async function runBounded(executable: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout: number }): Promise<SandboxResult> {
  return new Promise(resolve => {
    const child = spawn(executable, args, {
      cwd: opts.cwd, env: opts.env, stdio: 'pipe', detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let reason = '';
    let settled = false;
    const kill = () => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { child.kill('SIGKILL'); }
    };
    const timeout = Number.isFinite(opts.timeout) ? Math.max(1, Math.min(opts.timeout, 60_000)) : 30_000;
    const timer = setTimeout(() => { reason = 'Command timed out'; kill(); }, timeout);
    const capture = (which: 'stdout' | 'stderr', chunk: Buffer) => {
      const remaining = Math.max(0, MAX_OUTPUT_BYTES - bytes);
      const accepted = chunk.subarray(0, remaining);
      bytes += accepted.length;
      if (which === 'stdout') stdout += accepted.toString('utf8');
      else stderr += accepted.toString('utf8');
      if (chunk.length > remaining && !reason) { reason = 'Command output exceeded size limit'; kill(); }
    };
    child.stdout.on('data', (chunk: Buffer) => capture('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => capture('stderr', chunk));
    child.on('error', error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${error.message}`, exitCode: 1 });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (reason) stderr += `\n${reason}`;
      resolve({ stdout, stderr, exitCode: reason ? 1 : (code ?? 1) });
    });
  });
}

export class Sandbox {
  private mode: 'bun' | 'docker';

  constructor() {
    this.mode = process.env.SANDBOX_MODE === 'docker' ? 'docker' : 'bun';
  }

  async run(command: string, opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}): Promise<SandboxResult> {
    // Neither mode is a security boundary: host execution is unrestricted,
    // and Docker mounts the workspace including any files it contains.
    if (process.env.AUTOORG_ALLOW_UNSAFE_SANDBOX !== '1') {
      return { stdout: '', stderr: 'Sandbox execution disabled: unsafe execution requires explicit opt-in and external isolation', exitCode: 126 };
    }
    // Denylist FIRST — a blocked command must never reach a shell, in any mode.
    const denial = findDeniedCommand(command);
    if (denial) {
      return { stdout: '', stderr: denial, exitCode: 126 };
    }

    if (this.mode === 'docker') {
      return this.runDocker(command, opts);
    }
    return this.runBun(command, opts);
  }

  private async runBun(command: string, opts: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<SandboxResult> {
    return runBounded('bash', ['-c', command], {
      cwd: opts.cwd ?? process.cwd(), env: scrubbedSandboxEnv(opts.env), timeout: opts.timeout ?? 30000,
    });
  }

  private async runDocker(command: string, opts: { cwd?: string; timeout?: number }): Promise<SandboxResult> {
    // Docker is not a security boundary for files in the mounted workspace.
    const cwd = opts.cwd ?? process.cwd();
    return runBounded('docker', [
      'run', '--rm', '-v', `${cwd}:/workspace`, '-w', '/workspace',
      'node:24-slim', 'bash', '-c', command,
    ], { timeout: opts.timeout ?? 60000 });
  }
}

export const sandbox = new Sandbox();
