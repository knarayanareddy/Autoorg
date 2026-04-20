TypeScript

import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getAdapter } from '@/adapters/adapter-factory.js';
import { getDb } from '@/db/migrate.js';
import { TEMPLATE_CURATOR_SYSTEM_PROMPT, TemplateCuratorSchema } from '@/prompts/template-curator.js';

export class TemplateRegistry {
  async seedFromDisk(root = path.join(process.cwd(), 'platform', 'templates')) {
    const files = ['baseline.json', 'research_org.json', 'quality_org.json', 'portfolio_org.json'];

    for (const file of files) {
      const full = path.join(root, file);
      const manifest = JSON.parse(await readFile(full, 'utf-8'));

      const db = getDb();
      db.prepare(`
        INSERT OR IGNORE INTO org_templates
        (id, tenant_id, template_key, display_name, visibility, category, manifest_json, version, status)
        VALUES (?, NULL, ?, ?, 'public', ?, ?, ?, 'active')
      `).run(
        `tpl_${nanoid(10)}`,
        manifest.template_key,
        manifest.display_name,
        manifest.category ?? 'general',
        JSON.stringify(manifest),
        manifest.version ?? '1.0.0'
      );
      db.close();
    }
  }

  async publish(opts: {
    tenantId?: string;
    userId?: string;
    templateKey: string;
    displayName: string;
    visibility: 'private' | 'tenant' | 'public';
    manifest: Record<string, unknown>;
  }) {
    const adapter = getAdapter({
      provider: (process.env.DEFAULT_LLM_PROVIDER ?? 'anthropic') as any,
      model: 'claude-sonnet-4-5',
    });

    const review = await adapter.structured({
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: TEMPLATE_CURATOR_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(opts.manifest, null, 2) },
      ],
      schema: TemplateCuratorSchema,
    });

    if (!review.publishable) {
      throw new Error(`Template not publishable: ${review.summary}`);
    }

    const db = getDb();
    const id = `tpl_${nanoid(10)}`;

    db.prepare(`
      INSERT INTO org_templates
      (id, tenant_id, template_key, display_name, visibility, category, manifest_json, version, status, published_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, '1.0.0', 'active', ?)
    `).run(
      id,
      opts.tenantId ?? null,
      opts.templateKey,
      opts.displayName,
      opts.visibility,
      review.category || 'general',
      JSON.stringify(opts.manifest),
      opts.userId ?? null
    );

    db.close();
    return { templateId: id, review };
  }

  list(opts?: {
    tenantId?: string;
    visibility?: 'private' | 'tenant' | 'public';
  }) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM org_templates
      WHERE status = 'active'
        AND (
          visibility = 'public'
          OR (visibility = 'tenant' AND tenant_id = ?)
          OR (visibility = 'private' AND tenant_id = ?)
        )
      ORDER BY updated_at DESC
    `).all(opts?.tenantId ?? null, opts?.tenantId ?? null);
    db.close();
    return rows;
  }
}
13. Role registry