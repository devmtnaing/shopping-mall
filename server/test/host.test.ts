import { afterEach, describe, expect, it } from 'vitest';
import { issueHostToken, secretMatches, verifyHostToken } from '../src/host';
import { startServer } from '../src/server';
import { TestClient } from './helpers';

describe('host tokens', () => {
  it('verify with the right secret and not after 12 hours', () => {
    const t = issueHostToken('s3cret', 0);
    expect(verifyHostToken('s3cret', t, 1000)).toBe(true);
    expect(verifyHostToken('other', t, 1000)).toBe(false);
    expect(verifyHostToken('s3cret', t, 13 * 3600 * 1000)).toBe(false);
  });

  it('reject tampered tokens', () => {
    const [h, , s] = issueHostToken('s3cret').split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'host', exp: 9e9 })).toString('base64url');
    expect(verifyHostToken('s3cret', `${h}.${forged}.${s}`)).toBe(false);
    expect(verifyHostToken('s3cret', 'garbage')).toBe(false);
  });

  it('compares secrets without leaking length', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abc', 'abcd')).toBe(false);
  });
});

describe('host role on the server', () => {
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
  const signIn = (secret: string) =>
    fetch(`http://127.0.0.1:${server.port}/host-token`, { method: 'POST', body: JSON.stringify({ secret }) });

  it('signs in the host, shows them as host, and lets only them announce', async () => {
    server = await startServer({ port: 0, hostSecret: 'open-sesame', presenceMs: 50 });
    expect((await signIn('wrong')).status).toBe(401);
    const { token } = (await (await signIn('open-sesame')).json()) as { token: string };
    const guest = client();
    await guest.join('Guest');
    const host = client();
    await host.join('Ko Host', { hostToken: token });
    expect(await guest.waitFor((m) => m.t === 'presence')).toMatchObject({
      joined: [{ name: 'Ko Host', host: true }],
    });
    const health = (await (await fetch(`http://127.0.0.1:${server.port}/health`)).json()) as object;
    expect(health).toMatchObject({ host: true, hostLogin: true });

    guest.send({ t: 'chat', text: '/announce free coffee' });
    host.send({ t: 'chat', text: '/announce Doors close at 9' });
    expect(await guest.waitFor((m) => m.t === 'announce')).toMatchObject({ text: 'Doors close at 9' });
    expect(guest.messages.filter((m) => m.t === 'announce')).toHaveLength(1);
  });

  it('refuses an invalid token, and has no host sign-in without a secret', async () => {
    server = await startServer({ port: 0 });
    expect((await signIn('anything')).status).toBe(404);
    const c = client();
    await c.open();
    c.send({ t: 'join', name: 'Faker', look: { color: '#000000' }, hostToken: issueHostToken('guess') });
    expect(await c.waitFor((m) => m.t === 'error')).toMatchObject({ code: 'bad-token' });
  });

  it('rate-limits sign-in attempts', async () => {
    server = await startServer({ port: 0, hostSecret: 'x' });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await signIn('nope')).status);
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[6]).toBe(429);
  });
});
