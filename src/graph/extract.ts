/**
 * AutoOrg — Graph Extraction Logic
 */

import { getAdapter } from '@/adapters/adapter-factory.js';
import { withLLMRetry } from '@/utils/retry.js';
import { parseStructuredOutput } from '@/utils/structured-output.js';
import type { OrgConfig, ModelConfig } from '@/types/index.js';
import {
  buildEntityExtractionPrompt,
  buildEntityExtractionUserMessage,
  EntityExtractionSchema,
  type EntityExtractionOutput,
} from '@/prompts/entity-extraction.js';
import {
  buildRelationshipExtractionPrompt,
  buildRelationshipExtractionUserMessage,
  RelationshipExtractionSchema,
  type RelationshipExtractionOutput,
} from '@/prompts/relationship-extraction.js';
import type { GraphNode } from './graph-db.js';

export async function extractEntities(
  seedMaterial: string,
  config: OrgConfig
): Promise<{ entities: EntityExtractionOutput['entities']; costUsd: number; coverageScore: number }> {
  const modelConfig: ModelConfig = config.modelAssignments.DreamAgent ?? { provider: 'anthropic', model: 'claude-3-haiku-20240307' };
  const adapter = getAdapter(modelConfig);
  
  const response = await withLLMRetry('EntityExtractor', () =>
    adapter.run({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: buildEntityExtractionPrompt() },
        { role: 'user', content: buildEntityExtractionUserMessage(seedMaterial) },
      ],
      temperature: 0.2,
    })
  );

  const parsed = parseStructuredOutput(response.content, EntityExtractionSchema);
  return { entities: parsed.entities, costUsd: response.costUsd ?? 0, coverageScore: parsed.coverage_score };
}

export async function extractRelationships(
  seedMaterial: string,
  nodes: GraphNode[],
  config: OrgConfig
): Promise<{ relationships: RelationshipExtractionOutput['relationships']; costUsd: number }> {
  const modelConfig: ModelConfig = config.modelAssignments.DreamAgent ?? { provider: 'anthropic', model: 'claude-3-haiku-20240307' };
  const adapter = getAdapter(modelConfig);
  
  const response = await withLLMRetry('RelationshipExtractor', () =>
    adapter.run({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: buildRelationshipExtractionPrompt() },
        { role: 'user', content: buildRelationshipExtractionUserMessage(seedMaterial, nodes) },
      ],
      temperature: 0.2,
    })
  );

  const parsed = parseStructuredOutput(response.content, RelationshipExtractionSchema);
  return { relationships: parsed.relationships, costUsd: response.costUsd ?? 0 };
}
