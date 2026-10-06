import { createHmac } from 'node:crypto';
import { parseConfig } from '@shopping-mall/shared/config';
import type { OwnerInfo } from '@shopping-mall/shared/owners';
import type { RemovedShop, RentalApplication } from '@shopping-mall/shared/rentals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import config from '../../mall.config';
import { seedIfEmpty } from '../src/db/content';
import type { Sql } from '../src/db/db';
import { issueHostToken } from '../src/host';
import type { Email } from '../src/mail';
import { verifyWebhook } from '../src/mail-events';
import { startServer } from '../src/server';
import { freshSchema, TEST_DB } from './db';

const SECRET = 'test-secret';
const KEY = Buffer.from('a-webhook-signing-key').toString('base64');
const WEBHOOK = `whsec_${KEY}`;

/** Headers Resend would send with `body` (Svix's scheme), signed with `secret` at `at` (s). */
function sign(body: string, at = Math.floor(Date.now() / 1000), secret = KEY) {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const sig = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${id}.${at}.${body}`)
    .digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(at), 'svix-signature': `v1,${sig}` };
}

describe('mail webhook signatures', () => {
  it('accepts the provider’s signature and nothing else', () => {
    const body = '{"type":"email.delivered"}';
    expect(verifyWebhook(WEBHOOK, sign(body), body)).toBe(true);
    // a second signature listed (a secret being rotated) still finds the good one
    const h = sign(body);
    expect(verifyWebhook(WEBHOOK, { ...h, 'svix-signature': `v1,AAAA ${h['svix-signature']}` }, body)).toBe(
      true,
    );
    expect(verifyWebhook(WEBHOOK, sign(body), `${body} `)).toBe(false); // the body changed
    expect(verifyWebhook(WEBHOOK, sign(body, undefined, Buffer.from('other').toString('base64')), body)).toBe(
      false,
    );
    expect(verifyWebhook(WEBHOOK, sign(body, Math.floor(Date.now() / 1000) - 600), body)).toBe(false); // old: a replay
    expect(verifyWebhook(WEBHOOK, {}, body)).toBe(false);
  });
});

describe.runIf(TEST_DB)('mail webhook', () => {
  let db: { sql: Sql; drop: () => Promise<void> };
  let server: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  let mail: (Email & { id: string })[] = [];
  let ip = 0;
  const host = { Authorization: `Bearer ${issueHostToken(SECRET)}`, 'Content-Type': 'application/json' };
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = host) =>
    fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Client-IP': `10.1.0.${++ip % 250}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const get = async <T>(path: string) => (await (await call('GET', path)).json()) as T;
  /** The provider reports on email `id`. */
  const report = (id: string, type: string, extra: Record<string, unknown> = {}) => {
    const body = JSON.stringify({
      type,
      created_at: new Date().toISOString(),
      data: { email_id: id, ...extra },
    });
    return fetch(`${base}/api/mail/events`, { method: 'POST', headers: sign(body), body });
  };
  const hardBounce = { bounce: { type: 'Permanent', subType: 'General', message: 'No such user' } };
  const application = async (slot: string, business: string, email = 'kg@example.com') => {
    expect(
      (
        await call(
          'POST',
          '/api/rentals',
          { slot, name: 'Ko Gyi', email, business, kind: 'cafe', about: 'Mohinga' },
          {},
        )
      ).status,
    ).toBe(201);
    return (await get<RentalApplication[]>('/api/rentals')).find(
      (a) => a.business === business,
    ) as RentalApplication;
  };
  const shopIn = (slot: string, name: string, id = 'kg-mohinga') =>
    call('PUT', `/api/shops/${id}`, { id, slot, name, colors: { bg: '#101010', accent: '#ff8800' } });
  const shops = async () =>
    (await get<{ config: { shops: { id: string }[] } }>('/api/content')).config.shops.map((s) => s.id);

  beforeEach(async () => {
    db = await freshSchema();
    await seedIfEmpty(db.sql, parseConfig(config));
    mail = [];
    server = await startServer({
      port: 0,
      db: db.sql,
      hostSecret: SECRET,
      publicUrl: 'https://mall.example',
      mailWebhookSecret: WEBHOOK,
      mailer: {
        name: 'test',
        async send(e) {
          const id = `email-${mail.length + 1}`;
          mail.push({ ...e, id });
          return { id };
        },
      },
    });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterEach(async () => {
    await server.close();
    await db.drop();
  });

  it('turns away reports the provider didn’t sign', async () => {
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'email-1', ...hardBounce } });
    const unsigned = await fetch(`${base}/api/mail/events`, { method: 'POST', body });
    expect(unsigned.status).toBe(401);
    const forged = await fetch(`${base}/api/mail/events`, {
      method: 'POST',
      headers: sign(body, undefined, Buffer.from('guess').toString('base64')),
      body,
    });
    expect(forged.status).toBe(401);
  });

  it('shows what became of the approval email, and a delay changes nothing else', async () => {
    const a = await application('e3', 'KG Mohinga');
    await call('POST', `/api/rentals/${a.id}/approve`);
    expect((await report('email-1', 'email.delivery_delayed')).status).toBe(200);
    let [got] = await get<RentalApplication[]>('/api/rentals');
    expect(got).toMatchObject({ status: 'approved', mail: { status: 'delayed' } });
    await report('email-1', 'email.delivered');
    [got] = await get<RentalApplication[]>('/api/rentals');
    expect(got?.mail?.status).toBe('delivered');
    // a temporary bounce is shown, but gives up on nobody
    await report('email-1', 'email.bounced', { bounce: { type: 'Transient', message: 'Mailbox full' } });
    [got] = await get<RentalApplication[]>('/api/rentals');
    expect(got).toMatchObject({ status: 'approved', mail: { status: 'bounced', detail: 'Mailbox full' } });
    // reports about emails that aren't ours are thanked and ignored
    expect((await report('someone-elses', 'email.bounced', hardBounce)).status).toBe(200);
  });

  it('a hard bounce of the approval turns the application down, with why', async () => {
    const a = await application('e3', 'KG Mohinga');
    await call('POST', `/api/rentals/${a.id}/approve`);
    await report('email-1', 'email.bounced', hardBounce);
    const [got] = await get<RentalApplication[]>('/api/rentals');
    expect(got).toMatchObject({ status: 'rejected', mail: { status: 'bounced', detail: 'No such user' } });
    expect(got?.reason).toBe('The approval email to kg@example.com bounced: No such user');
    // a later "delivered" doesn't paper over the bounce
    await report('email-1', 'email.delivered');
    expect((await get<RentalApplication[]>('/api/rentals'))[0]?.mail?.status).toBe('bounced');
  });

  it('when the set-password email can’t be sent, the shop leaves and its unit is for rent again', async () => {
    const a = await application('e3', 'KG Mohinga');
    await call('POST', `/api/rentals/${a.id}/approve`);
    expect((await shopIn('e3', 'KG Mohinga')).status).toBe(200);
    expect((await call('POST', '/api/shops/kg-mohinga/owner', { email: 'kg@example.com' })).status).toBe(201);
    expect(mail[1]?.subject).toContain('KG Mohinga');
    const owners = await get<OwnerInfo[]>('/api/owners');
    expect(owners.find((o) => o.shop === 'kg-mohinga')?.mail?.status).toBe('sent');

    await report('email-2', 'email.suppressed', {
      suppressed: { type: 'OnAccountSuppressionList', message: 'on the suppression list' },
    });
    expect(await shops()).not.toContain('kg-mohinga');
    const [removed] = await get<RemovedShop[]>('/api/removed-shops');
    expect(removed).toMatchObject({
      shop: 'kg-mohinga',
      slot: 'e3',
      name: 'KG Mohinga',
      ownerEmail: 'kg@example.com',
    });
    expect(removed?.reason).toMatch(/^The set-password email to kg@example.com wasn’t sent/);
    expect((await get<RentalApplication[]>('/api/rentals'))[0]).toMatchObject({ status: 'rejected' });
    expect((await get<OwnerInfo[]>('/api/owners')).some((o) => o.shop === 'kg-mohinga')).toBe(false);
    // the unit can be applied for again
    expect((await application('e3', 'Someone New', 'new@example.com')).status).toBe('pending');
  });

  it('a bounced approval also takes out the shop made from it, if nobody signed in to it', async () => {
    const a = await application('e3', 'KG Mohinga');
    await call('POST', `/api/rentals/${a.id}/approve`);
    await shopIn('e3', 'KG Mohinga');
    await report('email-1', 'email.bounced', hardBounce);
    expect(await shops()).not.toContain('kg-mohinga');
  });

  it('never takes out a shop whose owner has signed in, or someone else’s', async () => {
    const a = await application('e3', 'KG Mohinga');
    await call('POST', `/api/rentals/${a.id}/approve`);
    await shopIn('e3', 'KG Mohinga');
    const { token } = (await (
      await call('POST', '/api/shops/kg-mohinga/owner', { email: 'kg@example.com' })
    ).json()) as {
      token: string;
    };
    expect(
      (await call('POST', '/api/owner/password', { token, password: 'mohinga-morning' }, {})).status,
    ).toBe(200);
    await report('email-2', 'email.bounced', hardBounce);
    expect(await shops()).toContain('kg-mohinga');
    expect((await get<RentalApplication[]>('/api/rentals'))[0]?.status).toBe('approved');

    // the host's own shop in a unit with a bounced approval: different name, no owner: stays
    const b = await application('e4', 'Late Applicant', 'late@example.com');
    await call('POST', `/api/rentals/${b.id}/approve`);
    await shopIn('e4', 'The Host’s Pop-up', 'popup');
    await report('email-3', 'email.bounced', hardBounce);
    expect(await shops()).toContain('popup');
  });

  it('turning an application down can say why', async () => {
    const a = await application('e3', 'KG Mohinga');
    expect(
      (await call('POST', `/api/rentals/${a.id}/reject`, { reason: 'Unit promised to a café' })).status,
    ).toBe(200);
    expect((await get<RentalApplication[]>('/api/rentals'))[0]).toMatchObject({
      status: 'rejected',
      reason: 'Unit promised to a café',
    });
    const b = await application('e4', 'No Reason', 'n@example.com');
    expect((await call('POST', `/api/rentals/${b.id}/reject`)).status).toBe(200); // a reason is optional
  });
});
