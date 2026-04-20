import { nanoid } from 'nanoid';
import { getDb } from '@/db/migrate.js';

export class EconomicEngine {
  constructor(private runId: string) {}

  async ensureWallet() {
    const db = getDb();
    const row = db.prepare(`SELECT id FROM org_wallets WHERE run_id = ?`).get(this.runId);
    if (!row) {
      db.prepare(`
        INSERT INTO org_wallets (id, run_id, balance_credits)
        VALUES (?, ?, ?)
      `).run(`wal_${nanoid(10)}`, this.runId, 100.0); // Seed with 100 base credits
    }
    db.close();
  }

  async getBalance(): Promise<number> {
    const db = getDb();
    const row = db.prepare(`SELECT balance_credits FROM org_wallets WHERE run_id = ?`).get(this.runId) as any;
    db.close();
    return row?.balance_credits ?? 0;
  }

  async transfer(toRunId: string, amount: number, memo: string) {
    const db = getDb();
    
    const sender = db.prepare(`SELECT id, balance_credits FROM org_wallets WHERE run_id = ?`).get(this.runId) as any;
    const receiver = db.prepare(`SELECT id FROM org_wallets WHERE run_id = ?`).get(toRunId) as any;

    if (!sender || sender.balance_credits < amount) {
      db.close();
      throw new Error(`Insufficient credits: ${sender?.balance_credits ?? 0} < ${amount}`);
    }

    if (!receiver) {
      db.close();
      throw new Error(`Receiver wallet not found for run: ${toRunId}`);
    }

    // Atomic Transaction
    const transaction = db.transaction(() => {
      // Deduct
      db.prepare(`UPDATE org_wallets SET balance_credits = balance_credits - ?, total_spent = total_spent + ?, updated_at = datetime('now') WHERE id = ?`)
        .run(amount, amount, sender.id);
      
      // Credit
      db.prepare(`UPDATE org_wallets SET balance_credits = balance_credits + ?, total_earned = total_earned + ?, updated_at = datetime('now') WHERE id = ?`)
        .run(amount, amount, receiver.id);

      // Ledger
      db.prepare(`INSERT INTO swarm_ledgers (id, from_wallet_id, to_wallet_id, amount, transaction_type, memo) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(`txn_${nanoid(10)}`, sender.id, receiver.id, amount, 'settlement', memo);
    });

    transaction();
    db.close();
  }

  async escrow(amount: number, memo: string) {
    const db = getDb();
    const sender = db.prepare(`SELECT id, balance_credits FROM org_wallets WHERE run_id = ?`).get(this.runId) as any;
    
    if (sender.balance_credits < amount) {
      db.close();
      throw new Error(`Insufficient credits for escrow: ${sender.balance_credits} < ${amount}`);
    }

    db.prepare(`UPDATE org_wallets SET balance_credits = balance_credits - ?, updated_at = datetime('now') WHERE id = ?`)
      .run(amount, sender.id);
    
    db.prepare(`INSERT INTO swarm_ledgers (id, from_wallet_id, amount, transaction_type, memo) VALUES (?, ?, ?, ?, ?)`)
      .run(`txn_${nanoid(10)}`, sender.id, amount, 'contract_escrow', memo);
    
    db.close();
  }
}
