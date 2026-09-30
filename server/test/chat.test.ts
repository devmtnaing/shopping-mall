import { afterEach, describe, expect, it } from 'vitest';
import { pruneChat, recentChat } from '../src/db/chat';
import { startServer } from '../src/server';
import { freshSchema, TEST_DB } from './db';
import { TestClient } from './helpers';

let db: Awaited<ReturnType<typeof freshSchema>> | null = null;
let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  await db?.drop();
  server = db = null;
});

describe.skipIf(!TEST_DB)('chat history', () => {
  it('keeps what was said in Postgres, so a newcomer sees it even after a restart', async () => {
    db = await freshSchema();
    server = await startServer({ port: 0, db: db.sql, presenceMs: 100 });
    const a = new TestClient(server.port);
    clients.push(a);
    await a.join('Aye');
    a.send({ t: 'chat', text: 'meet at the fountain' });
    await a.waitFor((m) => m.t === 'chat');
    await new Promise((r) => setTimeout(r, 100)); // saving doesn't hold up the chat
    expect(await recentChat(db.sql, 'main', 20)).toMatchObject([
      { name: 'Aye', text: 'meet at the fountain' },
    ]);

    a.close();
    await server.close();
    server = await startServer({ port: 0, db: db.sql, presenceMs: 100 });
    const b = new TestClient(server.port);
    clients.push(b);
    const welcome = await b.join('Bo');
    expect(welcome.chat?.map((c) => c.text)).toEqual(['meet at the fountain']);
  });

  it('deletes messages older than the retention period', async () => {
    db = await freshSchema();
    await db.sql`insert into chat (room, name, text, at) values
      ('main', 'Old', 'from last month', now() - interval '40 days'),
      ('main', 'New', 'from today', now())`;
    expect(await pruneChat(db.sql, 30)).toBe(1);
    expect((await recentChat(db.sql, 'main', 20)).map((c) => c.text)).toEqual(['from today']);
  });
});
