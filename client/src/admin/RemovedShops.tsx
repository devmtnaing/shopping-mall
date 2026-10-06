// Shops taken out of the mall, the latest first, each with why: the host's reason, or that the
// emails to its owner bounced. The server keeps a copy of each (removed_shops), to put back by hand.
import type { RemovedShop } from '@shopping-mall/shared/rentals';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function RemovedShops(props: { shops: RemovedShop[]; unit: (slot: string) => string }) {
  if (props.shops.length === 0) return null;
  return (
    <section class="removed-shops" aria-labelledby="removed-title">
      <h2 id="removed-title">Removed shops</h2>
      <p class="hint">
        Taken out of the mall, by you or because the emails to their owner bounced. Their units are for rent
        again.
      </p>
      <ol class="rental-list">
        {props.shops.map((r) => (
          <li key={r.id} class="rental rejected">
            <header class="rental-head">
              <span>
                <strong>{r.name}</strong>
                <small>
                  {props.unit(r.slot)} · removed {when(r.removedAt)}
                </small>
              </span>
            </header>
            {r.ownerEmail && <p class="rental-contact">Owner: {r.ownerEmail}</p>}
            <p class="rental-reason">
              <strong>Why:</strong> {r.reason}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
