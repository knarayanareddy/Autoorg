import nodeFetch from 'node-fetch';

export async function safeWebFetch(url: string, maxChars = 8000): Promise<{ summary: string; text: string; status: number }> {
  try {
    const res = await nodeFetch(url, {
      headers: { 'User-Agent': 'AutoOrg/1.0 (Phase6; Autonomous Research)' },
      timeout: 10000,
    } as any);

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
    return {
      summary: `Failed to fetch ${url}: ${String(err)}`,
      text: '',
      status: 500,
    };
  }
}
