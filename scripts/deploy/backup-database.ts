#!/usr/bin/env bun
/** Consistent SQLite snapshot, including committed WAL changes; destination must not exist. */
import { Database } from 'bun:sqlite';
import { closeSync, constants, lstatSync, openSync, unlinkSync } from 'node:fs';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Expected a source and new backup destination');
const sourceStat = lstatSync(source);
if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('Source must be a regular file');
process.umask(0o077);
// Reserve the destination exclusively and refuse even dangling symlinks.
const fd = openSync(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
closeSync(fd);
try {
  const db = new Database(source, { readonly: true });
  try { db.run('VACUUM INTO ?', [destination]); } finally { db.close(); }
} catch (error) {
  try { unlinkSync(destination); } catch { /* best effort */ }
  throw error;
}
