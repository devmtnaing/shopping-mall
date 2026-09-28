// All shops in mall order: move up/down (buttons, so it works by keyboard), edit, delete.
import type { Shop } from '@shopping-mall/shared/config';
import type { Slot } from '@shopping-mall/shared/meta';
import { fileUrl } from './api';
import { slotLabel } from './ShopEditor';

export function ShopList(props: {
  shops: Shop[];
  slots: Slot[];
  onEdit: (s: Shop) => void;
  onAdd: () => void;
  onDelete: (s: Shop) => void;
  onMove: (from: number, to: number) => void;
}) {
  const unit = (id: string) => {
    const s = props.slots.find((x) => x.id === id);
    return s ? slotLabel(s) : id;
  };
  return (
    <section aria-labelledby="shops-title">
      <header class="section-head">
        <h2 id="shops-title">Shops</h2>
        <button type="button" class="btn primary" onClick={props.onAdd}>
          Add shop
        </button>
      </header>
      <ol class="shop-list">
        {props.shops.map((s, i) => (
          <li key={s.id}>
            <span class="swatch" style={{ background: s.colors.bg, color: s.colors.accent }}>
              {s.logo ? <img src={fileUrl(s.logo)} alt="" /> : s.name.slice(0, 1)}
            </span>
            <span class="shop-text">
              <strong>{s.name}</strong>
              <small>
                {unit(s.slot)} ·{' '}
                {s.products?.adapter === 'static'
                  ? `${s.products.items.length} products`
                  : s.products
                    ? 'product feed'
                    : 'no products'}
              </small>
            </span>
            <span class="actions">
              <button
                type="button"
                class="btn small ghost"
                aria-label={`Move ${s.name} up`}
                disabled={i === 0}
                onClick={() => props.onMove(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="btn small ghost"
                aria-label={`Move ${s.name} down`}
                disabled={i === props.shops.length - 1}
                onClick={() => props.onMove(i, i + 1)}
              >
                ↓
              </button>
              <button type="button" class="btn small" onClick={() => props.onEdit(s)}>
                Edit
              </button>
              <button type="button" class="btn small danger" onClick={() => props.onDelete(s)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
