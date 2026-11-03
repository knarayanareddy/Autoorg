const KEY_NAME = 'autoorg-api-key';

export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  try { return window.sessionStorage.getItem(KEY_NAME) ?? ''; } catch { return ''; }
}

export function setApiKey(key: string): void {
  if (key) window.sessionStorage.setItem(KEY_NAME, key);
  else window.sessionStorage.removeItem(KEY_NAME);
}

/** Restrict credentials to local relative API paths, never arbitrary URLs. */
export function apiHeaders(url: string, initial?: HeadersInit, key = ''): Headers {
  const headers = new Headers(initial);
  const base = 'https://dashboard.invalid';
  const parsed = new URL(url, base);
  if (key && url.startsWith('/') && !url.startsWith('//') && parsed.origin === base && (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/'))) {
    headers.set('x-api-key', key);
  }
  return headers;
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...options, headers: apiHeaders(url, options.headers, getApiKey()) });
}
