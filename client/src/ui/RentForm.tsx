// Apply to rent a vacant unit: a few details for the mall's host, who approves one application
// per unit in /admin (shared/src/rentals.ts). Nothing is kept on this device.

import { useSignal } from '@preact/signals';
import type { RentalRequest } from '@shopping-mall/shared/rentals';
import { t } from '../i18n';
import type { Key } from '../i18n/en';
import { httpUrl } from '../net/socket';
import { rentUnit } from '../state';
import { Dialog } from './Dialog';

type Field = 'name' | 'email' | 'phone' | 'business' | 'about';
const FIELDS: { id: Field; label: Key; type?: string; auto?: string; max: number; optional?: boolean }[] = [
  { id: 'business', label: 'rent.business', auto: 'organization', max: 80 },
  { id: 'name', label: 'rent.name', auto: 'name', max: 80 },
  { id: 'email', label: 'rent.email', type: 'email', auto: 'email', max: 120 },
  { id: 'phone', label: 'rent.phone', type: 'tel', auto: 'tel', max: 40, optional: true },
];

const ERRORS: Record<number, Key> = { 400: 'rent.invalid', 409: 'rent.taken', 429: 'rent.tooMany' };

export function RentForm({ slot }: { slot: string }) {
  const values = useSignal<Record<Field, string>>({
    name: '',
    email: '',
    phone: '',
    business: '',
    about: '',
  });
  const honeypot = useSignal('');
  const state = useSignal<'idle' | 'sending' | 'sent'>('idle');
  const error = useSignal<Key | null>(null);
  const url = httpUrl('/api/rentals');
  const close = () => (rentUnit.value = null);
  const set = (id: Field) => (e: Event) => {
    values.value = { ...values.value, [id]: (e.target as HTMLInputElement).value };
  };

  const send = async (e: Event) => {
    e.preventDefault();
    if (!url || state.value !== 'idle') return;
    state.value = 'sending';
    error.value = null;
    const v = values.value;
    const body: RentalRequest = {
      slot,
      name: v.name,
      email: v.email,
      business: v.business,
      about: v.about,
      ...(v.phone.trim() ? { phone: v.phone } : {}),
      ...(honeypot.value ? { website: honeypot.value } : {}),
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        state.value = 'sent';
        return;
      }
      // 404: a server without a database has no /api
      error.value = res.status === 404 ? 'rent.offline' : (ERRORS[res.status] ?? 'rent.error');
    } catch {
      error.value = 'rent.error';
    }
    state.value = 'idle';
  };

  return (
    <Dialog title={t('rent.title')} eyebrow={t('zone.vacant')} variant="sheet" onClose={close}>
      {state.value === 'sent' ? (
        <div class="rent">
          <p class="rent-done" role="status">
            {t('rent.sent')}
          </p>
          <button type="button" class="cta cta-primary" onClick={close}>
            {t('close')}
          </button>
        </div>
      ) : !url ? (
        <p class="note">{t('rent.offline')}</p>
      ) : (
        <form class="rent" onSubmit={send}>
          <p class="note">{t('rent.intro')}</p>
          {FIELDS.map((f) => (
            <label key={f.id} class="rent-field">
              <span class="field-label">{t(f.label)}</span>
              <input
                class="search"
                type={f.type ?? 'text'}
                autoComplete={f.auto}
                maxLength={f.max}
                required={!f.optional}
                value={values.value[f.id]}
                onInput={set(f.id)}
              />
            </label>
          ))}
          <label class="rent-field">
            <span class="field-label">{t('rent.about')}</span>
            <textarea
              class="search rent-about"
              rows={4}
              maxLength={1000}
              required
              value={values.value.about}
              onInput={set('about')}
            />
          </label>
          {/* honeypot: hidden from people (and screen readers), so only bots fill it in */}
          <input
            class="rent-trap"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot.value}
            onInput={(e) => (honeypot.value = (e.target as HTMLInputElement).value)}
          />
          {error.value && (
            <p class="field-error" role="alert">
              {t(error.value)}
            </p>
          )}
          <p class="note rent-privacy">{t('rent.privacy')}</p>
          <button type="submit" class="cta cta-primary" disabled={state.value === 'sending'}>
            {t(state.value === 'sending' ? 'rent.sending' : 'rent.send')}
          </button>
        </form>
      )}
    </Dialog>
  );
}
