TypeScript

import chalk from 'chalk';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { parseStructuredOutputLenient } from '@/utils/structured-output.js';
import type { ModelConfig, LLMProvider } from '@/types/index.js';
import { GraphExtractionSchema, buildExtractionSystemPrompt, buildExtractionUserPrompt, type GraphExtraction } from './prompts.js';

export interface TextChunk {
  id: string;
  text: string;
}

export function chunkSeedText(
  text: string,
  size: number = 1400,
  overlap: number = 250
): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (let i = 0; i < text.length; i += (size - overlap)) {
    const chunk = text.slice(i, i + size);
    if (chunk.trim().length < 80) continue;
    chunks.push({
      id: `seed_${chunks.length + 1}`,
      text: chunk,
    });
  }
  return chunks;
}

function emptyExtraction(): GraphExtraction {
  return { nodes: [], edges: [] };
}

export async function extractChunkGraph(
  chunk: TextChunk,
  model: ModelConfig
): Promise<{ extraction: GraphExtraction; costUsd: number }> {
  const adapter = getAdapter(model);

  const response = await adapter.run({
    model: model.model,
    messages: [
      { role: 'system', content: buildExtractionSystemPrompt() },
      { role: 'user', content: buildExtractionUserPrompt(chunk.id, chunk.text) },
    ],
    maxTokens: 2200,
    temperature: 0.2,
    timeoutMs: 90_000,
  });

  const extraction = parseStructuredOutputLenient(
    response.content,
    GraphExtractionSchema,
    emptyExtraction()
  );

  return {
    extraction,
    costUsd: response.costUsd,
  };
}

export async function extractSeedGraph(
  seedText: string,
  opts?: { model?: ModelConfig; onChunk?: (i: number, total: number) => void }
): Promise<{
  raw: Array<{ chunkId: string; extraction: GraphExtraction }>;
  totalCostUsd: number;
}> {
  const chunks = chunkSeedText(seedText);
  const model: ModelConfig = opts?.model ?? {
    provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as LLMProvider,
    model: 'claude-haiku-3-5',
  };

  let totalCostUsd = 0;
  const raw: Array<{ chunkId: string; extraction: GraphExtraction }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const result = await extractChunkGraph(chunk, model);
    raw.push({
      chunkId: chunk.id,
      extraction: result.extraction,
    });
    totalCostUsd += result.costUsd;
    opts?.onChunk?.(i + 1, chunks.length);
  }

  console.log(chalk.gray(`  Graph extraction cost: $${totalCostUsd.toFixed(5)}`));

  return { raw, totalCostUsd };
}
4. Replace src/graph/build.ts
This version uses extract.ts and normalize.ts, plus supports incremental graph updates from facts.
