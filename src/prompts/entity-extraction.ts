import { z } from 'zod';

export const EntityExtractionSchema = z.object({
  entities: z.array(z.object({
    label:      z.string(),
    type:       z.enum([
      'Person', 'Organization', 'Concept', 'Metric', 'Constraint',
      'Event', 'Technology', 'Method', 'Problem', 'Goal', 'Stakeholder',
      'Location', 'TimeFrame', 'Resource', 'Standard', 'Regulation',
    ]),
    description: z.string(),
    properties:  z.record(z.unknown()),
    sourceText:  z.string(),
    confidence:  z.number().min(0).max(1),
    aliases:     z.array(z.string()).optional(),
  })),
  entity_count: z.number(),
  coverage_score: z.number().min(0).max(1),
});

export type EntityExtractionOutput = z.infer<typeof EntityExtractionSchema>;

export function buildEntityExtractionPrompt(): string {
  return `You are the AutoOrg Entity Extractor. Extract all meaningful entities from the provided text for knowledge graph construction. Structure the output as JSON matching the EntityExtractionSchema.`;
}

export function buildEntityExtractionUserMessage(seedMaterial: string): string {
  return `Extract entities from:\n\n${seedMaterial}`;
}
