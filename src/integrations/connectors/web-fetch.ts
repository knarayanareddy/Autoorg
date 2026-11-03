import { BlockList, isIP } from 'node:net';
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { lookup } from 'node:dns/promises';

/**
 * SSRF guard (OWASP A10).
 *
 * `safeWebFetch` used to hand any URL to node-fetch: `file://` returned local
 * files and `http://169.254.169.254/` reached the cloud metadata endpoint.
 * The tool manifest's `z.string().url()` accepts both, so validation lives
 * HERE, before any network call: scheme allowlist, private-IP blocking, DNS
 * resolution checks, and re-validation of every redirect hop.
 */

/** Schemes we are willing to speak. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/** Hostnames that are refused even before DNS is consulted. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data', // AWS IMDS hostname form
]);

const MAX_REDIRECTS = 5;

export class FetchBlockedError extends Error {
  constructor(reason: string) {
    super(`Blocked: ${reason}`);
    this.name = 'FetchBlockedError';
  }
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number) as [number, number, number, number];
    const [a, b, c] = octets;
    if (a === 0) return true;                                    // 0.0.0.0/8
    if (a === 10) return true;                                   // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;           // 100.64.0.0/10 CGNAT
    if (a === 127) return true;                                  // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;                     // 169.254.0.0/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;            // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true;            // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 2) return true;            // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 168) return true;                     // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true;        // 198.18.0.0/15 benchmarking
    if (a === 198 && b === 51 && c === 100) return true;         // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;          // 203.0.113.0/24 TEST-NET-3
    if (a >= 224) return true;                                   // multicast + reserved + broadcast
    return false;
  }

  if (isIP(ip) === 6) {
    // Only global unicast IPv6 is eligible. This intentionally rejects all
    // IPv4-mapped, NAT64 and other translation forms, regardless of spelling.
    // Also reject IETF special-purpose and 6to4 ranges within 2000::/3.
    const global = new BlockList();
    global.addSubnet('2000::', 3, 'ipv6');
    const special = new BlockList();
    special.addSubnet('2001::', 23, 'ipv6');
    special.addSubnet('2001:db8::', 32, 'ipv6');
    special.addSubnet('2002::', 16, 'ipv6');
    return !global.check(ip, 'ipv6') || special.check(ip, 'ipv6');
  }
  return true; // not an IP at all → treat as unsafe
}

/** Exact host or `*.suffix` wildcard match against a comma-separated allowlist. */
export function matchesHostAllowlist(hostname: string, entries: string[]): boolean {
  if (entries.length === 0) return true; // no allowlist configured
  const host = hostname.toLowerCase();
  return entries.some((raw) => {
    const entry = raw.trim().toLowerCase();
    if (!entry) return false;
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".example.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === entry;
  });
}

function hostnameOf(url: URL): string {
  const host = url.hostname.toLowerCase();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Validate one URL: scheme allowlist → host allowlist → private-IP rules →
 * DNS resolution. Throws `FetchBlockedError` on anything suspicious.
 * Exposed for tests; `safeWebFetch` also re-runs it for every redirect hop.
 */
type Address = { address: string; family: number };
type Resolver = (host: string) => Promise<Address[]>;
const resolveHost: Resolver = host => lookup(host, { all: true });

async function resolveFetchUrl(rawUrl: string, resolver: Resolver): Promise<{ url: URL; addresses: Address[] }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchBlockedError(`invalid URL: ${rawUrl.slice(0, 100)}`);
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new FetchBlockedError(`scheme '${url.protocol}' is not http(s)`);
  }

  const hostname = hostnameOf(url);
  if (!hostname) throw new FetchBlockedError('URL has no host');

  const allowlist = (process.env.AUTOORG_FETCH_HOST_ALLOWLIST ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!matchesHostAllowlist(hostname, allowlist)) {
    throw new FetchBlockedError(`host '${hostname}' is outside AUTOORG_FETCH_HOST_ALLOWLIST`);
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new FetchBlockedError(`host '${hostname}' is a local metadata/loopback name`);
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new FetchBlockedError(`address '${hostname}' is private/loopback/link-local`);
    }
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }

  // Hostname: resolve first so a public name rebound to an internal IP never
  // gets a connection. Fail closed when DNS cannot confirm the destination.
  let addresses: Address[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new FetchBlockedError(`DNS resolution failed for host '${hostname}'`);
  }
  if (addresses.length === 0) {
    throw new FetchBlockedError(`DNS returned no addresses for host '${hostname}'`);
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new FetchBlockedError(
        `host '${hostname}' resolves to private address '${address}'`
      );
    }
  }
  return { url, addresses };
}

export async function validateFetchUrl(rawUrl: string): Promise<URL> {
  return (await resolveFetchUrl(rawUrl, resolveHost)).url;
}

/** Pin the connection to an already checked DNS result; preserve the URL host for TLS/SNI. */
export function pinnedAgent(url: URL, addresses: Address[]): HttpAgent | HttpsAgent {
  const pinnedLookup = ((_hostname: string, options: { all?: boolean; family?: number }, callback: Function) => {
    const candidates = options.family ? addresses.filter(a => a.family === options.family) : addresses;
    if (!candidates.length) { callback(new Error('No validated address for requested family')); return; }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0]!.address, candidates[0]!.family);
  }) as LookupFunction;
  return url.protocol === 'https:' ? new HttpsAgent({ lookup: pinnedLookup }) : new HttpAgent({ lookup: pinnedLookup });
}

export const MAX_FETCH_BYTES = 1024 * 1024;

/** Read at most one MiB regardless of Content-Length or transfer encoding. */
export async function readLimitedBody(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.length;
    if (bytes > MAX_FETCH_BYTES) {
      stream.destroy();
      throw new Error('Response body exceeds size limit');
    }
    chunks.push(data);
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
}

export async function safeWebFetch(url: string, maxChars = 8000, resolver: Resolver = resolveHost): Promise<{ summary: string; text: string; status: number }> {
  try {
    let target = await resolveFetchUrl(url, resolver);
    let current = target.url;

    // Follow redirects manually so EVERY hop passes validateFetchUrl —
    // otherwise a public 302 to http://169.254.169.254/ bypasses the guard.
    let res: IncomingMessage;
    let hops = 0;
    for (;;) {
      res = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = current.protocol === 'https:' ? httpsRequest : httpRequest;
        const req = request(current, {
          headers: { 'User-Agent': 'AutoOrg/1.0 (Phase6; Autonomous Research)' },
          agent: pinnedAgent(current, target.addresses),
          signal: AbortSignal.timeout(10000),
        }, resolve);
        req.on('error', reject);
        req.end();
      });

      const location = res.headers.location;
      const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode ?? 0);
      if (!isRedirect || !location) break;

      res.destroy();
      if (++hops > MAX_REDIRECTS) {
        throw new FetchBlockedError(`too many redirects (> ${MAX_REDIRECTS})`);
      }
      target = await resolveFetchUrl(new URL(location, current).toString(), resolver);
      current = target.url;
    }

    const body = await readLimitedBody(res);
    const clean = body.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();

    return {
      summary: `Fetched ${url} (${res.statusCode})`,
      text: clean.slice(0, Number.isFinite(maxChars) ? Math.max(0, Math.min(Math.trunc(maxChars), 100_000)) : 8000),
      status: res.statusCode ?? 500,
    };
  } catch (err) {
    if (err instanceof FetchBlockedError) {
      return { summary: err.message, text: '', status: 400 };
    }
    return {
      summary: `Failed to fetch ${url}: ${String(err)}`,
      text: '',
      status: 500,
    };
  }
}
