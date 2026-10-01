import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { mailerFromEnv, ownerInviteEmail, resendMailer } from '../src/mail';

describe('mail', () => {
  it('picks a provider from the environment, or none', () => {
    expect(mailerFromEnv({})).toBeNull();
    expect(mailerFromEnv({ MAIL_PROVIDER: 'none', RESEND_API_KEY: 'k' })).toBeNull();
    expect(mailerFromEnv({ RESEND_API_KEY: 'k', MAIL_FROM: 'Mall <m@example.com>' })?.name).toBe('resend');
    expect(mailerFromEnv({ MAIL_PROVIDER: 'log' })?.name).toBe('log');
    expect(() => mailerFromEnv({ RESEND_API_KEY: 'k' })).toThrow(/MAIL_FROM/);
    expect(() => mailerFromEnv({ MAIL_PROVIDER: 'pigeon' })).toThrow(/Unknown MAIL_PROVIDER/);
  });

  it('sends through Resend’s API, and throws when it refuses', async () => {
    const got: { auth?: string; body: unknown }[] = [];
    let status = 200;
    const api = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        got.push({ auth: req.headers.authorization, body: JSON.parse(raw) });
        res.writeHead(status).end(status === 200 ? '{"id":"1"}' : '{"message":"bad from"}');
      });
    });
    await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
    const endpoint = `http://127.0.0.1:${(api.address() as AddressInfo).port}/emails`;
    const mailer = resendMailer({ apiKey: 're_test', from: 'Mall <m@example.com>', endpoint });
    try {
      await mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });
      expect(got[0]).toEqual({
        auth: 'Bearer re_test',
        body: { from: 'Mall <m@example.com>', to: 'a@example.com', subject: 'Hi', text: 'Hello' },
      });
      status = 422;
      await expect(mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/422/);
    } finally {
      api.close();
    }
  });

  it('writes the invite with the link, escaping the shop name in HTML', () => {
    const e = ownerInviteEmail({
      to: 'o@example.com',
      shop: 'Tom & <Jerry>',
      link: 'https://m/x?a=1&b=2',
      days: 7,
    });
    expect(e.text).toContain('https://m/x?a=1&b=2');
    expect(e.html).toContain('Tom &#38; &#60;Jerry&#62;');
    expect(e.html).not.toContain('<Jerry>');
  });
});
