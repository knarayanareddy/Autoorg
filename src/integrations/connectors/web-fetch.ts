import nodeFetch from 'node-fetch';
import { isIP } from 'node:net';
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
    const addr = ip.toLowerCase().split('%')[0]!;
    if (addr === '::' || addr === '::1') return true;            // unspecified + loopback
    // IPv4-mapped / NAT64 / 6to4 embed an IPv4 address — check that too.
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
      ?? addr.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
      if (mapped[1]!.includes('.')) return isPrivateAddress(mapped[1]!);
      const hi = parseInt(mapped[1]!, 16);
      const lo = parseInt(mapped[2]!, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const hextet = parseInt(addr.replace(/^.*:/, '').replace(/:.*/, '') || '0', 16);
    if (/^(f[cd])/.test(addr)) return true;                      // fc00::/7 unique local
    if (/^fe[89ab]/.test(addr)) return true;                     // fe80::/10 link-local
    if (/^ff/.test(addr)) return true;                           // ff00::/8 multicast
    if (/^2001:db8:/.test(addr)) return true;                    // 2001:db8::/32 documentation
    if (Number.isNaN(hextet)) return true;                       // unparseable → fail closed
    return false;
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
export async function validateFetchUrl(rawUrl: string): Promise<URL> {
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
    return url;
  }

  // Hostname: resolve first so a public name rebound to an internal IP never
  // gets a connection. Fail closed when DNS cannot confirm the destination.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
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
  return url;
}

export async function safeWebFetch(url: string, maxChars = 8000): Promise<{ summary: string; text: string; status: number }> {
  try {
    let current = await validateFetchUrl(url);

    // Follow redirects manually so EVERY hop passes validateFetchUrl —
    // otherwise a public 302 to http://169.254.169.254/ bypasses the guard.
    let res: import('node-fetch').Response;
    let hops = 0;
    for (;;) {
      res = await nodeFetch(current.toString(), {
        headers: { 'User-Agent': 'AutoOrg/1.0 (Phase6; Autonomous Research)' },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      } as any);

      const location = res.headers.get('location');
      const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
      if (!isRedirect || !location) break;

      if (++hops > MAX_REDIRECTS) {
        throw new FetchBlockedError(`too many redirects (> ${MAX_REDIRECTS})`);
      }
      current = await validateFetchUrl(new URL(location, current).toString());
    }

    const body = await res.text();
    const clean = body.replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();

    return {
      summary: `Fetched ${url} (${res.status})`,
      text: clean.slice(0, maxChars),
      status: res.status,
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
