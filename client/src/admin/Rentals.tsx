// Rental applications from visitors who pressed E at a vacant unit. Approving one turns down the
// others waiting for that unit; then "Create the shop" opens the editor with their details filled in.

import { useSignal } from '@preact/signals';
import type { Shop } from '@shopping-mall/shared/config';
import type { Slot } from '@shopping-mall/shared/meta';
import type { RentalApplication } from '@shopping-mall/shared/rentals';
import { api } from './api';
import { slotLabel } from './ShopEditor';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Rentals(props: {
  rentals: RentalApplication[];
  slots: Slot[];
  shops: Shop[];
  onChanged: () => void;
  onCreateShop: (a: RentalApplication) => void;
}) {
  const busy = useSignal<number | null>(null);
  const error = useSignal('');
  const unit = (id: string) => {
    const s = props.slots.find((x) => x.id === id);
    return s ? slotLabel(s) : `Unit ${id}`;
  };
  const shopIn = (slot: string) => props.shops.find((s) => s.slot === slot);
  const waiting = (slot: string) =>
    props.rentals.filter((r) => r.slot === slot && r.status === 'pending').length;

  const act = async (a: RentalApplication, action: 'approve' | 'reject' | 'delete') => {
    if (action === 'approve') {
      const others = waiting(a.slot) - 1;
      const extra =
        others > 0
          ? ` The ${others} other application${others > 1 ? 's' : ''} for this unit will be turned down.`
          : '';
      if (!confirm(`Approve ${a.business} for ${unit(a.slot)}?${extra}`)) return;
    }
    if (action === 'delete' && !confirm(`Delete the application from ${a.business}? This can't be undone.`))
      return;
    busy.value = a.id;
    error.value = '';
    try {
      if (action === 'delete') await api.deleteRental(a.id);
      else await api.decideRental(a.id, action);
      props.onChanged();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      busy.value = null;
    }
  };

  return (
    <section aria-labelledby="rentals-title">
      <header class="section-head">
        <h2 id="rentals-title">Rental applications</h2>
      </header>
      <p class="hint">
        Visitors apply by pressing E at a vacant unit. Approve one per unit (the others waiting for it are
        turned down), get in touch by email, then create their shop. Applicants aren't emailed automatically.
      </p>
      {error.value && (
        <p class="banner error" role="alert">
          {error.value}
        </p>
      )}
      {props.rentals.length === 0 && <p class="hint">No applications yet.</p>}
      <ol class="rental-list">
        {props.rentals.map((a) => {
          const taken = shopIn(a.slot);
          return (
            <li key={a.id} class={`rental ${a.status}`}>
              <header class="rental-head">
                <span>
                  <strong>{a.business}</strong>
                  <small>
                    {unit(a.slot)} · {when(a.createdAt)}
                  </small>
                </span>
                <span class={`status ${a.status}`}>
                  {a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? 'Approved' : 'Turned down'}
                </span>
              </header>
              <p class="rental-about">{a.about}</p>
              <p class="rental-contact">
                {a.name} · <a href={`mailto:${a.email}`}>{a.email}</a>
                {a.phone && (
                  <>
                    {' '}
                    · <a href={`tel:${a.phone}`}>{a.phone}</a>
                  </>
                )}
              </p>
              {taken && a.status !== 'rejected' && <p class="hint">This unit is now {taken.name}.</p>}
              <span class="actions">
                {a.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      class="btn small primary"
                      disabled={busy.value === a.id || !!taken}
                      onClick={() => act(a, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="btn small"
                      disabled={busy.value === a.id}
                      onClick={() => act(a, 'reject')}
                    >
                      Turn down
                    </button>
                  </>
                )}
                {a.status === 'approved' && !taken && (
                  <button type="button" class="btn small primary" onClick={() => props.onCreateShop(a)}>
                    Create the shop
                  </button>
                )}
                {a.status !== 'pending' && (
                  <button
                    type="button"
                    class="btn small danger"
                    disabled={busy.value === a.id}
                    onClick={() => act(a, 'delete')}
                  >
                    Delete
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
