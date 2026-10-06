import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { mailerFromEnv, ownerInviteEmail, rentalApprovedEmail, resendMailer } from '../src/mail';

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
      // with MAIL_REPLY_TO, replies go there
      const replying = resendMailer({
        apiKey: 're_test',
        from: 'm@example.com',
        replyTo: 'r@example.com',
        endpoint,
      });
      await replying.send({ to: 'a@example.com', subject: 'Hi', text: 'Hello' });
      expect(got[1]?.body).toMatchObject({ reply_to: 'r@example.com' });
      expect(replying.replyTo).toBe('r@example.com');
      status = 422;
      await expect(mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'x' })).rejects.toThrow(/422/);
    } finally {
      api.close();
    }
  });

  const from = { mall: 'Shopping Mall', site: 'https://mall.example.com', replies: false };

  it('writes the invite by name, with the link as a button and as text, escaping in HTML', () => {
    const e = ownerInviteEmail({
      to: 'o@example.com',
      name: 'Aye',
      shop: 'Tom & <Jerry>',
      link: 'https://m/x?a=1&b=2',
      days: 7,
      from,
    });
    expect(e.subject).toBe('Tom & <Jerry> is ready at Shopping Mall');
    expect(e.text).toMatch(/^Hi Aye,/);
    expect(e.text).toContain('https://m/x?a=1&b=2');
    expect(e.text).toContain('https://mall.example.com/admin/');
    expect(e.text).not.toContain('reply');
    expect(e.html).toContain('Tom &#38; &#60;Jerry&#62;');
    expect(e.html).not.toContain('<Jerry>');
    // the link is written out, not only behind the button
    expect(e.html?.match(/https:\/\/m\/x\?a=1&#38;b=2/g)).toHaveLength(3);
    expect(ownerInviteEmail({ to: 'o@example.com', shop: 'S', link: 'l', days: 7, from }).text).toMatch(
      /^Hello,/,
    );
  });

  it('writes the approval, inviting a reply only when replies reach someone', () => {
    const e = rentalApprovedEmail({ to: 'a@example.com', name: 'Aye', business: 'Verde', from });
    expect(e.subject).toBe('Your application for Verde at Shopping Mall is approved');
    expect(e.text).toMatch(/^Hi Aye,/);
    expect(e.text).toContain('applied at https://mall.example.com');
    expect(e.text).not.toContain('reply');
    const replying = rentalApprovedEmail({
      to: 'a',
      name: 'A',
      business: 'V',
      from: { ...from, replies: true },
    });
    expect(replying.text).toContain('just reply to this email');
  });
});
