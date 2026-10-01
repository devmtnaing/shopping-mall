// Add or edit one shop: details, colours, logo, links, products, with a live sign preview.

import { useSignal } from '@preact/signals';
import type { Shop } from '@shopping-mall/shared/config';
import type { Slot } from '@shopping-mall/shared/meta';
import { OWNER_LIMITS } from '@shopping-mall/shared/owners';
import { useEffect, useRef } from 'preact/hooks';
import { rentEn } from '../i18n/rent';
import { paintSign } from '../render/signs';
import { InteriorPlan } from '../ui/InteriorPlan';
import { layoutFor } from '../world/layouts';
import { type ApiError, api, type FieldError, fileUrl } from './api';
import { Area, Color, errorFor, Select, slug, Text } from './fields';
import { shrink } from './shrink';

type Product = { id: string; name: string; price: string; compareAt: string; image: string; url: string };
type Draft = {
  id: string;
  slot: string;
  name: string;
  tagline: string;
  category: string;
  bg: string;
  accent: string;
  logo: string;
  description: string;
  features: string;
  links: { label: string; url: string }[];
  mode: 'none' | 'list' | 'feed';
  feedUrl: string;
  products: Product[];
};

const toDraft = (s?: Shop): Draft => ({
  id: s?.id ?? '',
  slot: s?.slot ?? '',
  name: s?.name ?? '',
  tagline: s?.tagline ?? '',
  category: s?.category ?? '',
  bg: s?.colors.bg ?? '#1c1a17',
  accent: s?.colors.accent ?? '#e2b857',
  logo: s?.logo ?? '',
  description: s?.description ?? '',
  features: (s?.features ?? []).join('\n'),
  links: s?.links?.length ? s.links : [{ label: '', url: '' }],
  mode: s?.products?.adapter === 'json-url' ? 'feed' : s?.products ? 'list' : 'none',
  feedUrl: s?.products?.adapter === 'json-url' ? s.products.url : '',
  products:
    s?.products?.adapter === 'static'
      ? s.products.items.map((p) => ({
          id: p.id,
          name: p.name,
          price: String(p.price),
          compareAt: p.compareAt !== undefined ? String(p.compareAt) : '',
          image: p.image ?? '',
          url: p.url ?? '',
        }))
      : [],
});

const opt = (v: string) => (v.trim() ? v.trim() : undefined);

function toShop(d: Draft): Shop {
  const products =
    d.mode === 'feed'
      ? { adapter: 'json-url' as const, url: d.feedUrl.trim() }
      : d.mode === 'list'
        ? {
            adapter: 'static' as const,
            items: d.products.map((p, i) => ({
              id: p.id || slug(p.name) || `item-${i + 1}`,
              name: p.name.trim(),
              price: Number(p.price),
              ...(p.compareAt ? { compareAt: Number(p.compareAt) } : {}),
              ...(opt(p.image) ? { image: p.image } : {}),
              ...(opt(p.url) ? { url: p.url.trim() } : {}),
            })),
          }
        : undefined;
  return {
    id: d.id,
    slot: d.slot,
    name: d.name.trim(),
    ...(opt(d.tagline) ? { tagline: d.tagline.trim() } : {}),
    ...(opt(d.category) ? { category: d.category.trim() } : {}),
    colors: { bg: d.bg, accent: d.accent },
    ...(opt(d.logo) ? { logo: d.logo } : {}),
    ...(opt(d.description) ? { description: d.description.trim() } : {}),
    features: d.features
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean),
    links: d.links
      .filter((l) => l.label.trim() && l.url.trim())
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    ...(products ? { products } : {}),
  };
}

function SignPreview({ d, aspect }: { d: Draft; aspect: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = paintSign({
      title: d.name || 'Shop name',
      subtitle: d.tagline || undefined,
      bg: d.bg,
      accent: d.accent,
      width: 640,
      aspect,
    });
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Sign preview: ${d.name}`);
    host.current?.replaceChildren(canvas);
  }, [d.name, d.tagline, d.bg, d.accent, aspect]);
  return <div class="sign-preview" ref={host} />;
}

/** What the category puts inside the unit, as a plan from above. */
function InteriorPreview({ slot, category, accent }: { slot?: Slot; category: string; accent: string }) {
  const layout = layoutFor({ category: category.trim() || undefined });
  return (
    <figure class="interior-preview">
      <figcaption>
        <strong>Inside the shop</strong>
        <small>
          {layout
            ? `${rentEn[`plan.${layout}`]} Categories with “food”, “book”, “fashion”, “home” or “game” get their own furniture; anything else gets shelves.`
            : 'Left empty: the category says it’s for rent.'}
        </small>
      </figcaption>
      {slot && layout ? (
        <InteriorPlan
          slot={slot}
          layout={layout}
          accent={accent}
          label={`Plan of the unit: ${rentEn[`plan.${layout}`]}`}
        />
      ) : (
        !slot && <small class="hint">Choose a unit to see the plan.</small>
      )}
    </figure>
  );
}

function Upload({ kind, label, onDone }: { kind: string; label: string; onDone: (url: string) => void }) {
  const busy = useSignal(false);
  const error = useSignal('');
  return (
    <span class="upload">
      <label class="btn small">
        {busy.value ? 'Uploading…' : label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy.value}
          onChange={async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            busy.value = true;
            error.value = '';
            try {
              onDone((await api.upload(kind, await shrink(file, kind))).url);
            } catch (err) {
              error.value = (err as Error).message;
            } finally {
              busy.value = false;
            }
          }}
        />
      </label>
      {error.value && <small class="error">{error.value}</small>}
    </span>
  );
}

export function ShopEditor(props: {
  shop?: Shop;
  /** For a new shop: details to start from (an approved rental application). */
  prefill?: { slot: string; name: string; category: string; description: string };
  slots: Slot[];
  taken: Map<string, string>;
  /** A shop owner editing their own shop: the unit and id are the host's, products are capped. */
  owner?: boolean;
  onSaved: (shop: Shop) => void;
  onCancel: () => void;
}) {
  const isNew = !props.shop;
  const owner = !!props.owner;
  const maxProducts = owner ? OWNER_LIMITS.products : Infinity;
  const d = useSignal<Draft>(
    props.shop || !props.prefill
      ? toDraft(props.shop)
      : {
          ...toDraft(),
          slot: props.prefill.slot,
          category: props.prefill.category,
          // trimmed to what a shop allows; the host edits from here
          name: props.prefill.name.slice(0, 40),
          id: slug(props.prefill.name),
          description: props.prefill.description.slice(0, 600),
        },
  );
  const errors = useSignal<FieldError[]>([]);
  const status = useSignal('');
  const set = (patch: Partial<Draft>) => (d.value = { ...d.value, ...patch });
  const v = d.value;
  const slot = props.slots.find((s) => s.id === v.slot);
  const err = (path: string) => errorFor(errors.value, path);

  const save = async (e: Event) => {
    e.preventDefault();
    status.value = 'Saving…';
    errors.value = [];
    try {
      const shop = toShop(v);
      await api.saveShop(shop);
      status.value = '';
      props.onSaved(shop);
    } catch (x) {
      const ex = x as ApiError;
      errors.value = ex.fields ?? [];
      status.value = ex.message;
    }
  };

  const setProduct = (i: number, patch: Partial<Product>) =>
    set({ products: v.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <form class="editor" onSubmit={save} aria-labelledby="editor-title">
      <header class="editor-head">
        <h2 id="editor-title">{owner ? 'Your shop' : isNew ? 'New shop' : `Edit ${props.shop?.name}`}</h2>
        <div class="actions">
          <button type="button" class="btn ghost" onClick={props.onCancel}>
            {owner ? 'Undo changes' : 'Cancel'}
          </button>
          <button type="submit" class="btn primary">
            {isNew ? 'Add shop' : 'Save changes'}
          </button>
        </div>
      </header>
      {status.value && (
        <p
          class={errors.value.length || status.value !== 'Saving…' ? 'banner error' : 'banner'}
          role="status"
        >
          {status.value}
        </p>
      )}

      <SignPreview d={v} aspect={slot ? slot.sign.size[0] / slot.sign.size[1] : 4.3} />

      <div class="grid">
        <Text
          label="Name"
          value={v.name}
          required
          maxLength={40}
          error={err('name')}
          onInput={(name) =>
            set(isNew && (v.id === '' || v.id === slug(v.name)) ? { name, id: slug(name) } : { name })
          }
        />
        <Text
          label="Id (used in links)"
          value={v.id}
          required
          error={err('id')}
          hint={isNew ? `Link: ?s=${v.id || '…'}` : 'Ids can’t change after creating a shop.'}
          readOnly={!isNew}
          onInput={(id) => isNew && set({ id: slug(id) })}
        />
        {owner ? (
          <Text
            label="Unit"
            value={slot ? slotLabel(slot) : v.slot}
            readOnly
            hint="Ask the mall’s host to move."
            onInput={() => {}}
          />
        ) : (
          <Select
            label="Unit"
            value={v.slot}
            error={err('slot')}
            onChange={(s) => set({ slot: s })}
            options={[
              { value: '', label: 'Choose a unit…', disabled: true },
              ...props.slots.map((s) => {
                const owner = props.taken.get(s.id);
                const mine = owner === props.shop?.id;
                return {
                  value: s.id,
                  label: `${slotLabel(s)}${owner && !mine ? ` (taken: ${owner})` : ''}`,
                  disabled: !!owner && !mine,
                };
              }),
            ]}
          />
        )}
        <Text
          label="Category"
          value={v.category}
          placeholder="Food & drink"
          hint="Picks the furniture inside (see the plan below)."
          onInput={(category) => set({ category })}
        />
        <Text
          label="Tagline"
          value={v.tagline}
          maxLength={80}
          error={err('tagline')}
          onInput={(tagline) => set({ tagline })}
        />
        <div class="grid-2">
          <Color label="Sign colour" value={v.bg} error={err('colors.bg')} onInput={(bg) => set({ bg })} />
          <Color
            label="Accent"
            value={v.accent}
            error={err('colors.accent')}
            onInput={(accent) => set({ accent })}
          />
        </div>
      </div>

      <InteriorPreview slot={slot} category={v.category} accent={v.accent} />

      <div class="field">
        <span class="label">Logo</span>
        <span class="logo-row">
          {v.logo ? <img src={fileUrl(v.logo)} alt="" /> : <span class="logo-empty">No logo</span>}
          <Upload
            kind="logo"
            label={v.logo ? 'Replace logo' : 'Upload logo'}
            onDone={(logo) => set({ logo })}
          />
          {v.logo && (
            <button type="button" class="btn small ghost" onClick={() => set({ logo: '' })}>
              Remove
            </button>
          )}
        </span>
      </div>

      <Area
        label="Description"
        value={v.description}
        rows={3}
        error={err('description')}
        onInput={(description) => set({ description })}
      />
      <Area
        label="Features (one per line)"
        value={v.features}
        rows={3}
        onInput={(features) => set({ features })}
      />

      <fieldset>
        <legend>Links</legend>
        {v.links.map((l, i) => (
          <div class="row" key={i}>
            <Text
              label="Label"
              value={l.label}
              error={err(`links.${i}.label`)}
              onInput={(label) => set({ links: v.links.map((x, j) => (j === i ? { ...x, label } : x)) })}
            />
            <Text
              label="URL"
              value={l.url}
              placeholder="https://…"
              error={err(`links.${i}.url`)}
              onInput={(url) => set({ links: v.links.map((x, j) => (j === i ? { ...x, url } : x)) })}
            />
            <button
              type="button"
              class="btn small ghost"
              aria-label={`Remove link ${i + 1}`}
              onClick={() => set({ links: v.links.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        {v.links.length < 4 && (
          <button
            type="button"
            class="btn small"
            onClick={() => set({ links: [...v.links, { label: '', url: '' }] })}
          >
            Add link
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Products</legend>
        <div class="segmented" role="radiogroup" aria-label="Where products come from">
          {(owner && v.mode !== 'feed'
            ? (['none', 'list'] as const)
            : (['none', 'list', 'feed'] as const)
          ).map((m) => (
            <label key={m}>
              <input type="radio" name="mode" checked={v.mode === m} onChange={() => set({ mode: m })} />
              {m === 'none' ? 'No products' : m === 'list' ? 'List them here' : 'From a JSON feed'}
            </label>
          ))}
        </div>
        {v.mode === 'feed' && owner && (
          <p class="hint">Your products come from a feed the mall’s host set up. Ask them to change it.</p>
        )}
        {v.mode === 'feed' && !owner && (
          <Text
            label="Feed URL"
            value={v.feedUrl}
            placeholder="https://shop.example/products.json"
            error={err('products.url')}
            onInput={(feedUrl) => set({ feedUrl })}
          />
        )}
        {v.mode === 'list' && (
          <>
            {v.products.map((p, i) => (
              <div class="product-row" key={i}>
                {p.image ? <img src={fileUrl(p.image)} alt="" /> : <span class="thumb-empty" />}
                <Text
                  label="Product"
                  value={p.name}
                  error={err(`products.items.${i}.name`)}
                  onInput={(name) => setProduct(i, { name })}
                />
                <Text
                  label="Price"
                  value={p.price}
                  error={err(`products.items.${i}.price`)}
                  onInput={(price) => setProduct(i, { price })}
                />
                <Text label="Was" value={p.compareAt} onInput={(compareAt) => setProduct(i, { compareAt })} />
                <Text
                  label="Link"
                  value={p.url}
                  placeholder="https://…"
                  onInput={(url) => setProduct(i, { url })}
                />
                <Upload kind="product-image" label="Image" onDone={(image) => setProduct(i, { image })} />
                <button
                  type="button"
                  class="btn small ghost"
                  aria-label={`Remove ${p.name || `product ${i + 1}`}`}
                  onClick={() => set({ products: v.products.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
            ))}
            {v.products.length < maxProducts ? (
              <button
                type="button"
                class="btn small"
                onClick={() =>
                  set({
                    products: [
                      ...v.products,
                      { id: '', name: '', price: '', compareAt: '', image: '', url: '' },
                    ],
                  })
                }
              >
                Add product
              </button>
            ) : (
              <p class="hint">Up to {OWNER_LIMITS.products} products.</p>
            )}
          </>
        )}
      </fieldset>
    </form>
  );
}

export function slotLabel(s: Slot) {
  if (s.id === 'flagship') return 'Flagship (far end)';
  const upper = s.id.startsWith('u-');
  const side = s.id.replace('u-', '')[0] === 'w' ? 'left' : 'right';
  const n = Number(s.id.replace(/\D/g, '')) + 1;
  return `${upper ? 'Upper' : 'Ground'} floor · ${side} · unit ${n}`;
}
