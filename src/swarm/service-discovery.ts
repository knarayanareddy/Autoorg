import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export interface OrgService {
  runId: string;
  serviceKey: string;
  displayName: string;
  capabilityMd: string;
  unitPrice: number;
}

export class ServiceDiscovery {
  async register(service: OrgService) {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO service_registry (id, run_id, service_key, display_name, capability_md, unit_price_credits)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `svc_${nanoid(10)}`,
      service.runId,
      service.serviceKey,
      service.displayName,
      service.capabilityMd,
      service.unitPrice
    );
    db.close();
  }

  async find(query: string): Promise<OrgService[]> {
    const db = getDb();
    // Using simple LIKE for now, could be upgraded to FTS5 or Semantic Search
    const rows = db.prepare(`
      SELECT * FROM service_registry 
      WHERE capability_md LIKE ? OR display_name LIKE ?
    `).all(`%${query}%`, `%${query}%`) as any[];
    db.close();

    return rows.map(r => ({
      runId: r.run_id,
      serviceKey: r.service_key,
      displayName: r.display_name,
      capabilityMd: r.capability_md,
      unitPrice: r.unit_price_credits,
    }));
  }

  async getAll(): Promise<OrgService[]> {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM service_registry`).all() as any[];
    db.close();
    return rows.map(r => ({
      runId: r.run_id,
      serviceKey: r.service_key,
      displayName: r.display_name,
      capabilityMd: r.capability_md,
      unitPrice: r.unit_price_credits,
    }));
  }
}
