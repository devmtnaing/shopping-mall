import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { containsBlocked, maskBlocked } from '../src/moderation';
import { startServer } from '../src/server';
import { sleep, TestClient, until } from './helpers';

const list = { words: ['spam', 'scam'] };

describe('blocklist', () => {
  it('matches whole words, ignoring case, accents and look-alike digits', () => {
    expect(containsBlocked(list, 'buy SP4M now')).toBe(true);
    expect(containsBlocked(list, 'spammer')).toBe(false); // not a whole word
    expect(containsBlocked(list, 'hello')).toBe(false);
  });

  it('masks blocked words and keeps the rest as typed', () => {
    expect(maskBlocked(list, 'this is Spam, ok?')).toBe('this is ••••, ok?');
  });

  it('does nothing without a list', () => {
    expect(maskBlocked({ words: [] }, 'spam')).toBe('spam');
  });
});

describe('moderation on the server', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  const clients: TestClient[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await server.close();
  });
  const client = () => {
    const c = new TestClient(server.port);
    clients.push(c);
    return c;
  };

  it('masks chat and refuses blocked names', async () => {
    server = await startServer({ port: 0, blocklist: list });
    const a = client();
    await a.join('Aye');
    a.send({ t: 'chat', text: 'no scam here' });
    expect(await a.waitFor((m) => m.t === 'chat')).toMatchObject({ text: 'no •••• here' });
    const b = client();
    await b.open();
    b.send({ t: 'join', name: 'Scam King', look: { color: '#000000' } });
    expect(await b.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'bad-name' });
  });

  it('posts reports with recent chat to the webhook, once per 30 s', async () => {
    const got: unknown[] = [];
    const hook = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got.push(JSON.parse(body));
        res.end();
      });
    });
    await new Promise<void>((r) => hook.listen(0, r));
    const port = (hook.address() as { port: number }).port;
    server = await startServer({ port: 0, reportWebhook: `http://127.0.0.1:${port}/` });
    const a = client();
    await a.join('Aye');
    const b = client();
    const wb = await b.join('Bo');
    b.send({ t: 'chat', text: 'rude words' });
    await a.waitFor((m) => m.t === 'chat');
    a.send({ t: 'report', id: wb.id, reason: 'rude' });
    a.send({ t: 'report', id: wb.id, reason: 'again' }); // rate limited
    await until(() => got.length > 0);
    await sleep(150);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      reporter: { name: 'Aye' },
      reported: { name: 'Bo' },
      reason: 'rude',
      recentChat: [{ name: 'Bo', text: 'rude words' }],
    });
    hook.close();
  });
});
