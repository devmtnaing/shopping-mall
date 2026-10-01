import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../src/server';

describe('usage events', () => {
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });
  const post = (body: string) =>
    fetch(`http://127.0.0.1:${server?.port}/api/events`, { method: 'POST', body });

  it('logs each valid event as one JSON line, and nothing identifying', async () => {
    const lines: string[] = [];
    server = await startServer({ port: 0, eventLog: (l) => lines.push(l) });
    const res = await post(
      JSON.stringify([
        { e: 'visit', locale: 'my', tier: 'medium' },
        { e: 'shop', shop: 'lumen-coffee' },
      ]),
    );
    expect(res.status).toBe(204);
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { t: 'event', at: expect.any(String), e: 'visit', locale: 'my', tier: 'medium' },
      { t: 'event', at: expect.any(String), e: 'shop', shop: 'lumen-coffee' },
    ]);
  });

  it('drops junk quietly, and logs nothing when switched off', async () => {
    const lines: string[] = [];
    server = await startServer({ port: 0, eventLog: (l) => lines.push(l) });
    expect((await post('not json')).status).toBe(204);
    expect((await post(JSON.stringify([{ e: 'hack', email: 'x@y.z' }]))).status).toBe(204);
    await server.close();
    server = await startServer({ port: 0, events: false, eventLog: (l) => lines.push(l) });
    expect((await post(JSON.stringify([{ e: 'visit' }]))).status).toBe(204);
    expect(lines).toEqual([]);
  });

  it('logs 10 batches from one address at once, then drops the rest (still 204)', async () => {
    const lines: string[] = [];
    server = await startServer({ port: 0, eventLog: (l) => lines.push(l) });
    for (let i = 0; i < 15; i++) expect((await post(JSON.stringify([{ e: 'visit' }]))).status).toBe(204);
    expect(lines).toHaveLength(10);
  });
});
