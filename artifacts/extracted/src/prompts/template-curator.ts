TypeScript

import { z } from 'zod';

export const TemplateCuratorSchema = z.object({
  publishable: z.boolean(),
  category: z.string(),
  strengths: z.array(z.string()).max(8),
  risks: z.array(z.string()).max(8),
  summary: z.string(),
});

export const TEMPLATE_CURATOR_SYSTEM_PROMPT = `
You review an AutoOrg template before publication.

Assess:
- whether the template has a coherent role mix,
- whether it appears safe and internally consistent,
- which use cases it fits,
- whether it is ready to publish.

Hard rules:
- Templates with unclear governance, missing approvals, or contradictory role incentives should not be publishable.
- Be conservative about publishing to public visibility.
`.trim();
12. Template registry