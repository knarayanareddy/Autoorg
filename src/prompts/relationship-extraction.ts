import { z } from 'zod';
import type { GraphNode } from '@/graph/graph-db.js';

export const RelationshipExtractionSchema = z.object({
  relationships: z.array(z.object({
    fromEntity:   z.string(),
    toEntity:     z.string(),
    relationship: z.enum([
      'RELATES_TO', 'CAUSES', 'SUPPORTS', 'CONTRADICTS',
      'PART_OF', 'INSTANCE_OF', 'USES', 'PRODUCES',
      'REQUIRES', 'IMPROVES', 'DEGRADES', 'MENTIONS',
      'DEVELOPED_BY', 'EMPLOYED_BY', 'LOCATED_IN',
      'OCCURRED_AT', 'PRECEDES', 'FOLLOWS', 'DEPENDS_ON',
      'COMPETES_WITH', 'COLLABORATES_WITH', 'REGULATES',
    ]),
    sourceText:   z.string(),
    confidence:   z.number().min(0).max(1),
    properties:   z.record(z.unknown()).optional(),
  })),
  relationship_count: z.number(),
});

export type RelationshipExtractionOutput = z.infer<typeof RelationshipExtractionSchema>;

export function buildRelationshipExtractionPrompt(): string {
  return `You are the AutoOrg Relationship Extractor. Extract relationships between the provided entities from the text. Structure as JSON matching RelationshipExtractionSchema.`;
}

export function buildRelationshipExtractionUserMessage(seedMaterial: string, entities: GraphNode[]): string {
  const entityList = entities.map(e => `- [${e.type}] ${e.label}`).join('\n');
  return `Entities:\n${entityList}\n\nSeed Material:\n${seedMaterial}`;
}
