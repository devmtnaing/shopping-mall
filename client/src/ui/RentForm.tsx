// Apply to rent a vacant unit: a few details for the mall's host, who approves one application
// per unit in /admin (shared/src/rentals.ts). Nothing is kept on this device.

import { useSignal } from '@preact/signals';
import type { RentalRequest } from '@shopping-mall/shared/rentals';
import { SHOP_KINDS, type ShopKind } from '@shopping-mall/shared/shop-kinds';
import { content } from '../content';
import { locale, t } from '../i18n';
import { RENT_TABLES, type RentKey, rentEn } from '../i18n/rent';
import { httpUrl } from '../net/socket';
import { appliedUnits, mallMeta, markApplied, rentUnit } from '../state';
import { Dialog } from './Dialog';
import { InteriorPlan } from './InteriorPlan';

type Field = 'name' | 'email' | 'phone' | 'business' | 'about';
const FIELDS: { id: Field; label: RentKey; type?: string; auto?: string; max: number; optional?: boolean }[] =
  [
    { id: 'business', label: 'rent.business', auto: 'organization', max: 80 },
    { id: 'name', label: 'rent.name', auto: 'name', max: 80 },
    { id: 'email', label: 'rent.email', type: 'email', auto: 'email', max: 120 },
    { id: 'phone', label: 'rent.phone', type: 'tel', auto: 'tel', max: 40, optional: true },
  ];

/** A rental-form string in the visitor's language (these ship with the form, not in en.ts). */
const tr = (key: RentKey) => RENT_TABLES[locale.value]?.[key] ?? rentEn[key];

const ERRORS: Record<number, RentKey> = { 400: 'rent.invalid', 409: 'rent.taken', 429: 'rent.tooMany' };

export function RentForm({ slot }: { slot: string }) {
  const values = useSignal<Record<Field, string>>({
    name: '',
    email: '',
    phone: '',
    business: '',
    about: '',
  });
  const kind = useSignal<ShopKind | ''>('');
  const honeypot = useSignal('');
  const unit = mallMeta.value?.slots.find((s) => s.id === slot);
  // already applied for this unit earlier in this session: show the thank-you, not the form again
  const state = useSignal<'idle' | 'sending' | 'sent'>(appliedUnits.value.includes(slot) ? 'sent' : 'idle');
  const error = useSignal<RentKey | null>(null);
  const url = httpUrl('/api/rentals');
  const close = () => (rentUnit.value = null);
  const set = (id: Field) => (e: Event) => {
    values.value = { ...values.value, [id]: (e.target as HTMLInputElement).value };
  };

  const send = async (e: Event) => {
    e.preventDefault();
    if (!url || !kind.value || state.value !== 'idle') return;
    state.value = 'sending';
    error.value = null;
    const v = values.value;
    const body: RentalRequest = {
      slot,
      name: v.name,
      email: v.email,
      business: v.business,
      kind: kind.value,
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
        markApplied(slot);
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
    <Dialog title={tr('rent.title')} eyebrow={t('zone.vacant')} variant="sheet" onClose={close}>
      {state.value === 'sent' ? (
        <div class="rent">
          <p class="rent-done" role="status">
            {tr('rent.sent')}
          </p>
          <button type="button" class="cta cta-primary" onClick={close}>
            {t('close')}
          </button>
        </div>
      ) : !url ? (
        <p class="note">{tr('rent.offline')}</p>
      ) : (
        <form class="rent" onSubmit={send}>
          <p class="note">{tr('rent.intro')}</p>
          {FIELDS.map((f) => (
            <label key={f.id} class="rent-field">
              <span class="field-label">{tr(f.label)}</span>
              <input
                class="search"
                type={f.type ?? 'text'}
                autoComplete={f.auto}
                maxLength={f.max}
                required={!f.optional}
                value={values.value[f.id]}
                onInput={set(f.id)}
              />
              {f.id === 'email' && <span class="note rent-hint">{tr('rent.emailHint')}</span>}
            </label>
          ))}
          <label class="rent-field">
            <span class="field-label">{tr('rent.kind')}</span>
            <select
              class="search"
              required
              value={kind.value}
              onChange={(e) => (kind.value = (e.target as HTMLSelectElement).value as ShopKind)}
            >
              <option value="" disabled>
                …
              </option>
              {SHOP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tr(`kind.${k}`)}
                </option>
              ))}
            </select>
          </label>
          {kind.value && (
            <figure class="rent-plan">
              {unit && (
                <InteriorPlan
                  slot={unit}
                  layout={kind.value}
                  accent={content.value.mall.accent}
                  label={tr(`plan.${kind.value}`)}
                />
              )}
              <figcaption class="note">
                {tr(`plan.${kind.value}`)} <span class="rent-plan-hint">{tr('rent.plan')}</span>
              </figcaption>
            </figure>
          )}
          <label class="rent-field">
            <span class="field-label">{tr('rent.about')}</span>
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
              {tr(error.value)}
            </p>
          )}
          <p class="note rent-privacy">{tr('rent.privacy')}</p>
          <button type="submit" class="cta cta-primary" disabled={state.value === 'sending'}>
            {tr(state.value === 'sending' ? 'rent.sending' : 'rent.send')}
          </button>
        </form>
      )}
    </Dialog>
  );
}
