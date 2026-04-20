TypeScript

import { z } from 'zod';
import { getDb } from '@/db/migrate.js';

export type CapabilityClass = 'search' | 'read' | 'verify' | 'execute' | 'transform';

export interface ToolExecutionContext {
  runId: string;
  cycleNumber: number;
  role: string;
  teamId?: string;
  taskId?: string;
  cwd?: string;
}

export interface ToolResult {
  summary: string;
  costUsd?: number;
  deterministic?: boolean;
  sources?: Array<{
    type: string;
    uri?: string;
    title?: string;
    excerpt?: string;
    metadata?: Record<string, unknown>;
  }>;
  output: unknown;
}

export interface ToolDefinition<TInput = any> {
  name: string;
  displayName: string;
  capabilityClass: CapabilityClass;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodTypeAny;
  defaultTimeoutMs: number;
  defaultCostHint?: number;
  replayable?: boolean;
  dangerous?: boolean;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition) {
    this.tools.set(def.name, def);

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO tool_definitions
      (name, display_name, capability_class, description, input_schema_json, output_schema_json,
       default_timeout_ms, default_cost_hint, replayable, dangerous)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      def.name,
      def.displayName,
      def.capabilityClass,
      def.description,
      JSON.stringify((def.inputSchema as any)?._def ?? {}),
      JSON.stringify((def.outputSchema as any)?._def ?? {}),
      def.defaultTimeoutMs,
      def.defaultCostHint ?? 0,
      def.replayable ? 1 : 0,
      def.dangerous ? 1 : 0,
    );
    db.close();
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }

  list() {
    return [...this.tools.values()];
  }
}
3. Default tool policies