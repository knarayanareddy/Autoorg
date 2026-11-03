import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter.ts';
import { OpenAIAdapter } from '../src/adapters/openai-adapter.ts';

let server: Server;
let base: string;
const counts = new Map<string, number>();
const authHeaders = new Map<string, string | undefined>();
const requests = new Map<string, any>();
const paths = new Map<string, string | undefined>();
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const model = body.model as string;
    requests.set(model, body);
    const provider = req.url?.includes('/messages') ? 'anthropic' : 'openai';
    const id = `${provider}:${model}`;
    paths.set(provider, req.url);
    authHeaders.set(provider, provider === 'anthropic' ? req.headers['x-api-key'] as string | undefined : req.headers.authorization);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    res.setHeader('Content-Type', 'application/json');
    if (model === 'test-fail') {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { message: 'synthetic failure', type: 'api_error' } }));
      return;
    }
    if (provider === 'anthropic') {
      res.end(JSON.stringify({ id: 'fixture', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'synthetic answer' }], model, stop_reason: 'end_turn', usage: model === 'test-missing' ? {} : { input_tokens: 10, output_tokens: 5 } }));
    } else {
      res.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: 'synthetic answer' }, finish_reason: 'stop' }], ...(model === 'test-missing' ? {} : { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
const options = (model: string) => ({ model, messages: [{ role: 'user' as const, content: 'hello' }], maxTokens: 10 });

describe('current provider SDK compatibility', () => {
  it('uses the upgraded provider SDK major versions', () => {
    const anthropic = JSON.parse(readFileSync('node_modules/@anthropic-ai/sdk/package.json', 'utf8')).version;
    const openai = JSON.parse(readFileSync('node_modules/openai/package.json', 'utf8')).version;
    expect(Number(anthropic.split('.')[0])).toBeGreaterThanOrEqual(1);
    expect(Number(openai.split('.')[0])).toBeGreaterThanOrEqual(7);
  });
  for (const provider of ['anthropic', 'openai'] as const) {
    it(`${provider} preserves response usage and fails closed on absent usage`, async () => {
      const adapter = provider === 'anthropic' ? new AnthropicAdapter('fixture-key', base) : new OpenAIAdapter('fixture-key', `${base}/v1`);
      const result = await adapter.run(options(provider === 'anthropic' ? 'claude-test-model' : 'gpt-4o'));
      expect(result.content).toBe('synthetic answer');
      expect(paths.get(provider)).toBe(provider === 'anthropic' ? '/v1/messages' : '/v1/chat/completions');
      if (provider === 'anthropic') expect(requests.get('claude-test-model').temperature).toBeUndefined();
      expect(authHeaders.get(provider)).toBe(provider === 'anthropic' ? 'fixture-key' : 'Bearer fixture-key');
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
      expect(result.costUsd).toBeGreaterThan(0);
      const missing = await adapter.run(options('test-missing'));
      expect(missing.costUsd).toBeUndefined();
    });
    it(`${provider} does not retry a billable failing request inside the SDK`, async () => {
      const adapter = provider === 'anthropic' ? new AnthropicAdapter('fixture-key', base) : new OpenAIAdapter('fixture-key', `${base}/v1`);
      await expect(adapter.run(options('test-fail'))).rejects.toThrow();
      expect(counts.get(`${provider}:test-fail`)).toBe(1);
    });
  }
});
