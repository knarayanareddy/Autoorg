/**
 * Web fetch SSRF tests — OWASP A10 (SSRF + local file read).
 *
 * `safeWebFetch` used to pass any URL straight to node-fetch: `file://` URLs
 * returned local files (200) and link-local metadata endpoints were
 * reachable. The fix validates the URL inside `safeWebFetch` — scheme
 * allowlist, private/loopback/link-local IP blocking, DNS-resolution
 * checks, redirect re-validation, and an optional host allowlist — because
 * the tool manifest's `z.string().url()` happily accepts `file://`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import {
  safeWebFetch,
  validateFetchUrl,
  isPrivateAddress,
  matchesHostAllowlist,
  FetchBlockedError,
} from '../src/integrations/connectors/web-fetch.ts';

let savedAllowlist: string | undefined;

beforeAll(() => {
  delete process.env.AUTOORG_FETCH_HOST_ALLOWLIST;
});
afterAll(() => {
  delete process.env.AUTOORG_FETCH_HOST_ALLOWLIST;
});
beforeEach(() => {
  savedAllowlist = process.env.AUTOORG_FETCH_HOST_ALLOWLIST;
  delete process.env.AUTOORG_FETCH_HOST_ALLOWLIST;
});
afterEach(() => {
  if (savedAllowlist === undefined) delete process.env.AUTOORG_FETCH_HOST_ALLOWLIST;
  else process.env.AUTOORG_FETCH_HOST_ALLOWLIST = savedAllowlist;
});

describe('isPrivateAddress', () => {
  it('classifies loopback, private, link-local and reserved IPv4', () => {
    for (const ip of [
      '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255',
      '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
      '198.18.0.1', '224.0.0.1', '255.255.255.255', '240.0.0.1',
      '192.0.2.1', '198.51.100.7', '203.0.113.9',
    ]) {
      expect(`${ip}: ${isPrivateAddress(ip)}`).toBe(`${ip}: true`);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '8.8.8.8', '172.32.0.1', '100.128.0.1']) {
      expect(`${ip}: ${isPrivateAddress(ip)}`).toBe(`${ip}: false`);
    }
  });

  it('classifies loopback, ULA, link-local and mapped IPv6', () => {
    for (const ip of [
      '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
      'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1',
    ]) {
      expect(`${ip}: ${isPrivateAddress(ip)}`).toBe(`${ip}: true`);
    }
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('matchesHostAllowlist', () => {
  it('matches exact hosts and dot-suffix wildcards only', () => {
    expect(matchesHostAllowlist('example.com', ['example.com'])).toBe(true);
    expect(matchesHostAllowlist('api.example.com', ['*.example.com'])).toBe(true);
    expect(matchesHostAllowlist('example.com', ['*.example.com'])).toBe(false);
    expect(matchesHostAllowlist('notexample.com', ['example.com'])).toBe(false);
    expect(matchesHostAllowlist('anything.org', [])).toBe(true); // no allowlist = pass
  });
});

describe('validateFetchUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    for (const url of [
      'file:///etc/hostname',
      'file://localhost/etc/passwd',
      'gopher://example.com/',
      'ftp://example.com/x',
      'data:text/plain,hello',
    ]) {
      await expect(validateFetchUrl(url)).rejects.toThrow(FetchBlockedError);
    }
  });

  it('rejects loopback/private/link-local IP literals', async () => {
    for (const url of [
      'http://127.0.0.1:8080/',
      'http://10.1.2.3/',
      'http://192.168.0.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://172.17.0.1/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
    ]) {
      await expect(validateFetchUrl(url)).rejects.toThrow(FetchBlockedError);
    }
  });

  it('rejects hostnames that fail DNS resolution (fail closed)', async () => {
    await expect(validateFetchUrl('http://nonexistent-host-zzz.invalid/'))
      .rejects.toThrow(/DNS|Blocked/i);
  });

  it('enforces the host allowlist before any network activity', async () => {
    process.env.AUTOORG_FETCH_HOST_ALLOWLIST = 'allowed.example';
    await expect(validateFetchUrl('https://blocked.example/page'))
      .rejects.toThrow(/allowlist/i);
    // A matching host passes the allowlist gate; whatever happens afterwards
    // (DNS for the reserved `.example` TLD will fail) it is not an allowlist hit.
    const err = await validateFetchUrl('https://allowed.example/page').then(
      () => null,
      (e: Error) => e
    );
    expect(err === null || !/allowlist/i.test(String(err))).toBe(true);
  });

  it('accepts public http(s) IP literals', async () => {
    const url = await validateFetchUrl('https://93.184.216.34/path');
    expect(url.hostname).toBe('93.184.216.34');
  });
});

describe('safeWebFetch (end to end)', () => {
  it('blocks file:// instead of returning local file contents', async () => {
    const res = await safeWebFetch('file:///etc/hostname');
    expect(res.status).toBe(400);
    expect(res.text).toBe('');
    expect(res.summary).toMatch(/^Blocked/);
  });

  it('blocks the cloud metadata endpoint', async () => {
    const res = await safeWebFetch('http://169.254.169.254/latest/meta-data/');
    expect(res.status).toBe(400);
    expect(res.text).toBe('');
    expect(res.summary).toMatch(/^Blocked/);
  });

  it('blocks loopback targets', async () => {
    for (const url of ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/']) {
      const res = await safeWebFetch(url);
      expect(`${url} -> ${res.status}`).toBe(`${url} -> 400`);
      expect(res.text).toBe('');
    }
  });

  it('blocks private RFC1918 targets', async () => {
    const res = await safeWebFetch('http://192.168.1.1/router');
    expect(res.status).toBe(400);
    expect(res.summary).toMatch(/^Blocked/);
  });

  it('still fetches a public https URL', async () => {
    const res = await safeWebFetch('https://registry.npmjs.org/-/ping', 200);
    expect(res.status).toBe(200);
    expect(res.summary).toContain('Fetched');
  });
});
