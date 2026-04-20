import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PortfolioVariantSpec {
  variant_key: string;
  display_name: string;
  constitution_variant: string;
  template_variant: string;
  role_mix: Record<string, number>;
  model_map: Record<string, string>;
}

export class VariantCatalog {
  constructor(
    private root = path.join(process.cwd(), 'portfolio', 'variants')
  ) {}

  async loadAll(): Promise<PortfolioVariantSpec[]> {
    try {
      const files = await readdir(this.root);
      const specs: PortfolioVariantSpec[] = [];

      for (const file of files.filter(f => f.endsWith('.json'))) {
        const spec = JSON.parse(await readFile(path.join(this.root, file), 'utf-8'));
        specs.push(spec);
      }

      return specs;
    } catch (err) {
      console.warn('No variants found in portfolio/variants directory.');
      return [];
    }
  }

  async loadByKeys(keys?: string[]) {
    const all = await this.loadAll();
    if (!keys?.length) return all;
    return all.filter(v => keys.includes(v.variant_key));
  }
}
