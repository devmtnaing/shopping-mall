// What became of an email the mall sent (delivered, bounced…), as its provider reported it.
import type { MailStatus } from '@shopping-mall/shared/rentals';

const LABEL: Record<MailStatus['status'], string> = {
  sent: 'Email sent',
  delivered: 'Email delivered',
  delayed: 'Email delayed (still trying)',
  bounced: 'Email bounced',
  suppressed: 'Email not sent: the address bounced before',
  complained: 'Email marked as spam',
  failed: 'Email failed',
};
const TONE: Record<MailStatus['status'], 'ok' | 'wait' | 'bad'> = {
  sent: 'wait',
  delivered: 'ok',
  delayed: 'wait',
  bounced: 'bad',
  suppressed: 'bad',
  complained: 'bad',
  failed: 'bad',
};

export function MailBadge(props: { mail?: MailStatus; to?: string }) {
  const m = props.mail;
  if (!m) return null;
  const when = new Date(m.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <p class={`mail-badge ${TONE[m.status]}`} title={when}>
      <strong>{LABEL[m.status]}</strong>
      {props.to && <> to {props.to}</>}
      {m.detail && m.status !== 'suppressed' && <>: {m.detail}</>}
    </p>
  );
}
