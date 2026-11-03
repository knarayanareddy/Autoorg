#!/usr/bin/env bun
/** Create a local API key without printing it or replacing an existing one. */
import { randomBytes } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, fchmodSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const envFile = path.resolve('.env');
const lockPath = `${envFile}.api-key-init.lock`;
let lockFd: number | undefined;
let tempPath: string | undefined;
try {
  lockFd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let original = '';
  try {
    const fd = openSync(envFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(fd).isFile()) throw new Error('Environment file is not a regular file');
      original = readFileSync(fd, 'utf8');
      // Existing secrets should not be world-readable, even if no key is added.
      fchmodSync(fd, 0o600);
    } finally { closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const lines = original.split(/\r?\n/);
  const indexes = lines.flatMap((line, i) => /^\s*(?:export\s+)?AUTOORG_API_KEY\s*=/.test(line) ? [i] : []);
  if (indexes.length > 1) throw new Error('Multiple API key entries; resolve them manually');
  if (parse(original).AUTOORG_API_KEY?.trim()) {
    console.log('API key already configured; no key was replaced.');
  } else {
    const key = randomBytes(32).toString('hex');
    if (indexes.length) lines[indexes[0]!] = `AUTOORG_API_KEY=${key}`;
    else {
      if (lines.at(-1) === '') lines.pop();
      lines.push(`AUTOORG_API_KEY=${key}`);
    }
    const content = lines.join('\n').replace(/\n*$/, '') + '\n';
    tempPath = `${envFile}.tmp-${randomBytes(8).toString('hex')}`;
    const fd = openSync(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, content, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tempPath, envFile);
    tempPath = undefined;
    console.log('API key created in .env with owner-only permissions.');
  }
} catch {
  console.error('Could not initialize the API key. Check .env permissions, symlinks, duplicate entries, and any stale initialization lock.');
  process.exitCode = 1;
} finally {
  if (tempPath) try { unlinkSync(tempPath); } catch { /* best effort */ }
  if (lockFd !== undefined) {
    closeSync(lockFd);
    try { unlinkSync(lockPath); } catch { /* best effort */ }
  }
}
