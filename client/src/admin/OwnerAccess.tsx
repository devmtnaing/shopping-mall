// The host's control over who looks after a shop: invite its owner by email (a one-time link to set
// a password, which the host sends them), make a fresh link, or take their access away.

import { useSignal } from '@preact/signals';
import { OWNER_LIMITS, type OwnerInfo } from '@shopping-mall/shared/owners';
import { api } from './api';

const STATUS: Record<OwnerInfo['status'], string> = {
  invited: 'Invited: hasn’t set a password yet',
  active: 'Signed up: can sign in and edit this shop',
  expired: 'The link ran out before it was used',
};

export function OwnerAccess(props: {
  shop: string;
  owner?: OwnerInfo;
  /** The email from the approved rental application for this unit, if there is one. */
  suggestedEmail?: string;
  onChanged: () => void;
}) {
  const email = useSignal(props.owner?.email ?? props.suggestedEmail ?? '');
  const link = useSignal('');
  const error = useSignal('');
  const busy = useSignal(false);
  const copied = useSignal(false);

  const invite = async (e: Event) => {
    e.preventDefault();
    if (
      props.owner?.status === 'active' &&
      !confirm('Make a new link? Their current password stops working.')
    )
      return;
    busy.value = true;
    error.value = '';
    try {
      const { token } = await api.inviteOwner(props.shop, email.value.trim());
      link.value = `${location.origin}/admin/?invite=${token}`;
      copied.value = false;
      props.onChanged();
    } catch (x) {
      error.value = (x as Error).message;
    } finally {
      busy.value = false;
    }
  };
  const remove = async () => {
    if (!confirm(`Take away ${props.owner?.email}’s access to this shop? They’re signed out straight away.`))
      return;
    try {
      await api.removeOwner(props.shop);
      link.value = '';
      props.onChanged();
    } catch (x) {
      error.value = (x as Error).message;
    }
  };

  return (
    <section class="owner-access" aria-labelledby="owner-title">
      <h3 id="owner-title">Shop owner</h3>
      <p class="hint">
        Let the tenant look after this shop themselves: name, tagline, colours, logo, links and up to{' '}
        {OWNER_LIMITS.products} products with photos. They can’t move units or touch other shops.
      </p>
      {props.owner && (
        <p>
          <strong>{props.owner.email}</strong> · {STATUS[props.owner.status]}
        </p>
      )}
      <form class="owner-row" onSubmit={invite}>
        <label class="sr-only" for="owner-email">
          Owner’s email
        </label>
        <input
          id="owner-email"
          type="email"
          required
          placeholder="owner@example.com"
          value={email.value}
          onInput={(e) => (email.value = (e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn small primary" disabled={busy.value}>
          {props.owner ? 'Make a new link' : 'Invite owner'}
        </button>
        {props.owner && (
          <button type="button" class="btn small danger" onClick={remove}>
            Remove access
          </button>
        )}
      </form>
      {error.value && (
        <p class="error" role="alert">
          {error.value}
        </p>
      )}
      {link.value && (
        <div class="invite-link">
          <p>
            Send this link to <strong>{email.value}</strong> (email, WhatsApp…). It works once, for{' '}
            {OWNER_LIMITS.inviteDays} days, and lets them set their password. The mall doesn’t send it for
            you.
          </p>
          <div class="owner-row">
            <input
              readOnly
              value={link.value}
              aria-label="Set-password link"
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              class="btn small"
              onClick={async () => {
                await navigator.clipboard.writeText(link.value);
                copied.value = true;
              }}
            >
              {copied.value ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
