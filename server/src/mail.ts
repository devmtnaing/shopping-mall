// Sending email (set-password links to shop owners). The rest of the server only sees `Mailer`, so
// a provider is one entry in PROVIDERS: pick it with MAIL_PROVIDER and give it its own settings.
// Without one configured, nothing is sent and the host copies links from /admin as before.

export type Email = { to: string; subject: string; text: string; html?: string };

export interface Mailer {
  /** The provider's name, for logs. */
  readonly name: string;
  /** Sends one email; throws if the provider refuses it. */
  send(email: Email): Promise<void>;
}

type Env = Record<string, string | undefined>;

/** Resend (https://resend.com/docs/api-reference/emails/send-email). Needs RESEND_API_KEY. */
export function resendMailer(opts: { apiKey: string; from: string; endpoint?: string }): Mailer {
  const endpoint = opts.endpoint ?? 'https://api.resend.com/emails';
  return {
    name: 'resend',
    async send(email) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: opts.from, ...email }),
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
  resend: (env) => resendMailer({ apiKey: need(env, 'RESEND_API_KEY'), from: need(env, 'MAIL_FROM') }),
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

/** The email that gives a shop's new owner their set-password link. */
export function ownerInviteEmail(o: { to: string; shop: string; link: string; days: number }): Email {
  const text = [
    `Hello,`,
    ``,
    `You can now look after ${o.shop} in the mall yourself: its name, colours, logo, links and products.`,
    ``,
    `Set your password here (the link works once, for ${o.days} days):`,
    o.link,
    ``,
    `Then sign in at the same /admin page with this email address and your password.`,
    ``,
    `If you weren't expecting this, you can ignore it.`,
  ].join('\n');
  const html = `<p>Hello,</p>
<p>You can now look after <strong>${escapeHtml(o.shop)}</strong> in the mall yourself: its name, colours, logo, links and products.</p>
<p><a href="${escapeHtml(o.link)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Set your password</a></p>
<p style="color:#666;font-size:13px">The link works once, for ${o.days} days. Then sign in at the same /admin page with this email address and your password.<br>If you weren't expecting this, you can ignore it.</p>`;
  return { to: o.to, subject: `Set up ${o.shop} in the mall`, text, html };
}
