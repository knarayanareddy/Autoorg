TypeScript

export async function safeWebFetch(url: string, maxChars = 8000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AutoOrg/1.0 Phase6' },
  });

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);

  return {
    summary: `Fetched ${url}`,
    contentType,
    text: plain,
  };
}