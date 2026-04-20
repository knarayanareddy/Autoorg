/**
 * AutoOrg — Local Embedding Engine
 *
 * Zero-cost embeddings using pure cosine similarity over
 * TF-IDF weighted term vectors. No external API. No GPU needed.
 * Accurate enough for semantic search over ~500-word transcript entries.
 */

import { createHash }  from 'node:crypto';
import { getDb }       from '@/db/migrate.js';

const TFIDF_DIMS         = 512;
const OLLAMA_EMBED_DIM   = 768;

export function serializeEmbedding(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i]!, i * 4);
  }
  return buf;
}

export function deserializeEmbedding(data: any): number[] {
  const buf = Buffer.from(data);
  const len = buf.length / 4;
  const vec: number[] = new Array(len);
  for (let i = 0; i < len; i++) {
    vec[i] = buf.readFloatLE(i * 4);
  }
  return vec;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, magnitudeA = 0, magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }
  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

const STOPWORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','up','about','into','through','during','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','can','that','this','it','its','he','she','they','we','you','i','my','our','your','his','her','their','what','which','who','when','where','how','why','all','each','every','both','few','more','most','other','some','such','no','not','only','same','so','than','too','very','just','because','as','until','while','although','though','since','unless','whether']);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function stem(word: string): string {
  return word.replace(/ing$/, '').replace(/tion$/, '').replace(/ness$/, '').replace(/ment$/, '').replace(/ize$/, '').replace(/ise$/, '').replace(/ed$/, '').replace(/ly$/, '').replace(/s$/, '');
}

function hashToken(token: string): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash) ^ token.charCodeAt(i);
    hash = hash & 0x7FFFFFFF;
  }
  return hash % TFIDF_DIMS;
}

function buildTFIDFVector(text: string): number[] {
  const tokens = tokenize(text).map(stem);
  const vec = new Array(TFIDF_DIMS).fill(0);
  if (tokens.length === 0) return vec;
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [term, count] of tf.entries()) {
    const weight = Math.log(1 + count) / Math.log(1 + tokens.length);
    vec[hashToken(term)] += weight;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

async function computeOllamaEmbedding(text: string): Promise<number[] | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model   = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
  try {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, prompt: text }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch { return null; }
}

// ── Ollama auto-detection ─────────────────────────────────────────────
async function isOllamaAvailable(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model   = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) return false;
    const data = await response.json() as { models?: Array<{ name: string }> };
    return data.models?.some(m => (m.name === model || m.name.startsWith(model + ':'))) ?? false;
  } catch { return false; }
}

let ollamaChecked    = false;
let ollamaIsPresent  = false;

export async function computeEmbedding(text: string): Promise<number[]> {
  if (!ollamaChecked) {
    ollamaIsPresent = await isOllamaAvailable();
    ollamaChecked   = true;
    if (ollamaIsPresent) {
      console.log('✅ Ollama detected with nomic-embed-text. Using high-quality vectors.');
    } else {
      console.log('⚠️  Ollama not detected or nomic-embed-text missing. Falling back to local TF-IDF.');
    }
  }

  const provider = ollamaIsPresent ? 'ollama' : 'local';

  if (provider === 'ollama') {
    const ollamaVec = await computeOllamaEmbedding(text);
    if (ollamaVec) return ollamaVec;
  }
  return buildTFIDFVector(text);
}

export async function computeEmbeddingCached(text: string): Promise<number[]> {
  const hash  = createHash('sha256').update(text).digest('hex');
  const model = ollamaIsPresent ? (process.env.EMBEDDING_MODEL ?? 'nomic-embed-text') : 'local-tfidf';

  const db  = getDb();
  const row = db.prepare(
    `SELECT embedding FROM embeddings_cache WHERE content_hash = ? AND model = ?`
  ).get(hash, model) as { embedding: Buffer } | undefined;
  db.close();

  if (row?.embedding) return deserializeEmbedding(row.embedding);

  const vec = await computeEmbedding(text);
  const db2 = getDb();
  db2.prepare(`
    INSERT OR IGNORE INTO embeddings_cache (content_hash, model, embedding, dimensions)
    VALUES (?, ?, ?, ?)
  `).run(hash, model, serializeEmbedding(vec), vec.length);
  db2.close();
  return vec;
}

export async function computeEmbeddingsBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await computeEmbeddingCached(texts[i]!));
    onProgress?.(i + 1, texts.length);
  }
  return results;
}
