// Sending email (approval notes to applicants, set-password links to shop owners). The rest of the server only sees `Mailer`, so
// a provider is one entry in PROVIDERS: pick it with MAIL_PROVIDER and give it its own settings.
// Without one configured, nothing is sent and the host copies links from /admin as before.

export type Email = { to: string; subject: string; text: string; html?: string };

export interface Mailer {
  /** The provider's name, for logs. */
  readonly name: string;
  /** Where replies go (MAIL_REPLY_TO), if anywhere: the emails only invite a reply when it's set. */
  readonly replyTo?: string;
  /** Sends one email; throws if the provider refuses it. */
  send(email: Email): Promise<void>;
}

type Env = Record<string, string | undefined>;

/** Resend (https://resend.com/docs/api-reference/emails/send-email). Needs RESEND_API_KEY. */
export function resendMailer(opts: {
  apiKey: string;
  from: string;
  replyTo?: string;
  endpoint?: string;
}): Mailer {
  const endpoint = opts.endpoint ?? 'https://api.resend.com/emails';
  return {
    name: 'resend',
    replyTo: opts.replyTo,
    async send(email) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: opts.from,
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
          ...email,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`resend: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** Prints each email instead of sending it: for local development. */
export function logMailer(): Mailer {
  return {
    name: 'log',
    async send(email) {
      console.log(`mail to ${email.to}: ${email.subject}\n${email.text}`);
    },
  };
}

const need = (env: Env, key: string) => {
  const v = env[key]?.trim();
  if (!v) throw new Error(`MAIL_PROVIDER=${env.MAIL_PROVIDER ?? 'resend'} needs ${key}`);
  return v;
};

/** Each provider, built from the environment. Add one here to support another service. */
const PROVIDERS: Record<string, (env: Env) => Mailer> = {
  resend: (env) =>
    resendMailer({
      apiKey: need(env, 'RESEND_API_KEY'),
      from: need(env, 'MAIL_FROM'),
      replyTo: env.MAIL_REPLY_TO?.trim() || undefined,
    }),
  log: () => logMailer(),
};

/**
 * The mailer MAIL_PROVIDER names (`resend` when unset but RESEND_API_KEY is), or null for none.
 * Throws for an unknown provider or missing settings, so a typo stops the server at start.
 */
export function mailerFromEnv(env: Env = process.env): Mailer | null {
  const provider = env.MAIL_PROVIDER?.trim() || (env.RESEND_API_KEY ? 'resend' : '');
  if (!provider || provider === 'none') return null;
  const make = PROVIDERS[provider];
  if (!make)
    throw new Error(`Unknown MAIL_PROVIDER "${provider}" (try: ${Object.keys(PROVIDERS).join(', ')})`);
  return make(env);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The mall an email comes from: its name and address (PUBLIC_URL), and whether replies reach anyone. */
export type Sender = { mall: string; site: string; replies: boolean };

/**
 * One email, plain and HTML, laid out the same way every time: a greeting by name, what happened
 * and why they're hearing about it, the link written out as well as a button (a button alone, from
 * a sender they don't know yet, is what phishing looks like), and who it's from.
 */
function letter(o: {
  to: string;
  subject: string;
  name?: string;
  paragraphs: string[];
  button?: { label: string; link: string; note: string };
  after?: string[];
  why: string;
  from: Sender;
}): Email {
  const hello = o.name ? `Hi ${o.name},` : 'Hello,';
  const reply = o.from.replies ? 'If you have any questions, just reply to this email.' : '';
  const sign = `${o.from.mall}\n${o.from.site}`;
  const text = [
    hello,
    ...o.paragraphs,
    ...(o.button ? [`${o.button.label}:\n${o.button.link}\n(${o.button.note})`] : []),
    ...(o.after ?? []),
    ...(reply ? [reply] : []),
    sign,
    `--\n${o.why}`,
  ].join('\n\n');
  const p = (t: string) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`;
  const b = o.button;
  const html = `<div style="font:15px/1.55 -apple-system,'Segoe UI',Roboto,sans-serif;color:#1d1b18;max-width:560px">
${p(hello)}
${o.paragraphs.map(p).join('\n')}
${
  b
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(b.link)}" style="display:inline-block;padding:11px 20px;background:#1d1b18;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(b.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#5f5a52">Or copy this link into your browser (${escapeHtml(b.note)}):<br><a href="${escapeHtml(b.link)}" style="color:#5f5a52;word-break:break-all">${escapeHtml(b.link)}</a></p>`
    : ''
}
${(o.after ?? []).map(p).join('\n')}
${reply ? p(reply) : ''}
<p style="margin:24px 0 0">${escapeHtml(o.from.mall)}<br><a href="${escapeHtml(o.from.site)}" style="color:#1d1b18">${escapeHtml(o.from.site.replace(/^https?:\/\//, ''))}</a></p>
<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e6e1d8;font-size:12px;color:#8a8478">${escapeHtml(o.why)}</p>
</div>`;
  return { to: o.to, subject: o.subject, text, html };
}

/** Telling someone their application to rent a unit was approved, and what happens next. */
export function rentalApprovedEmail(o: { to: string; name: string; business: string; from: Sender }): Email {
  return letter({
    to: o.to,
    subject: `Your application for ${o.business} at ${o.from.mall} is approved`,
    name: o.name,
    paragraphs: [
      `Good news: your application to open ${o.business} at ${o.from.mall} has been approved.`,
      `Next, we'll set up ${o.business} in the mall. When it's ready you'll get one more email from us, with a link to choose a password, so you can look after the shop yourself: its name, colours, logo, links and products.`,
      `There's nothing you need to do until then.`,
    ],
    why: `You're getting this because you applied at ${o.from.site} to rent a unit for ${o.business}.`,
    from: o.from,
  });
}

/** The email that gives a shop's new owner their set-password link. */
export function ownerInviteEmail(o: {
  to: string;
  /** The person's name, from their rental application, if there was one. */
  name?: string;
  shop: string;
  link: string;
  days: number;
  from: Sender;
}): Email {
  const admin = `${o.from.site}/admin/`;
  return letter({
    to: o.to,
    subject: `${o.shop} is ready at ${o.from.mall}`,
    name: o.name,
    paragraphs: [
      `${o.shop} is now open at ${o.from.mall}, and you can look after it yourself: its name, colours, logo, links and products.`,
      `To get started, choose a password for your shop account.`,
    ],
    button: {
      label: 'Choose your password',
      link: o.link,
      note: `it works once, within ${o.days} days`,
    },
    after: [`After that, sign in any time at ${admin} with this email address (${o.to}) and your password.`],
    why: `You're getting this because ${o.from.mall} gave ${o.to} access to ${o.shop}. If you weren't expecting it, you can ignore this email and nothing will change.`,
    from: o.from,
  });
}
