// The shop panel: who they are, what they sell, where to go next. Plain DOM, no three.js,
// so it also works for visitors whose device can't run WebGL.

import config from 'virtual:plaza-config';
import type { Shop } from '@plaza/shared/config';
import { useEffect, useState } from 'preact/hooks';
import { linkUrl } from '../links';
import { formatPrice, loadProducts, type Product, type ProductsResult } from '../shops/products';
import { panel } from '../state';
import { Dialog } from './Dialog';
import { IconShare } from './icons';
import { share } from './share';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function ProductCard({ p, accent }: { p: Product; accent: string }) {
  const body = (
    <>
      <div class="product-img" style={{ '--accent': accent }}>
        {p.image ? (
          <img src={p.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span>{p.name.slice(0, 1)}</span>
        )}
      </div>
      <div class="product-name">{p.name}</div>
      <div class="product-price">
        {formatPrice(p.price, config.mall.currency)}
        {p.compareAt && <s>{formatPrice(p.compareAt, config.mall.currency)}</s>}
      </div>
    </>
  );
  return p.url ? (
    <a class="product" href={p.url} {...external}>
      {body}
    </a>
  ) : (
    <div class="product">{body}</div>
  );
}

function Products({ shop }: { shop: Shop }) {
  const [result, setResult] = useState<ProductsResult | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    loadProducts(shop).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [shop]);

  if (result === 'loading')
    return (
      <div class="products" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} class="product skeleton" />
        ))}
      </div>
    );
  if (result.status === 'none') return null;
  if (result.status === 'error')
    return <p class="note">{result.message} Try the shop's own website below.</p>;
  if (result.items.length === 0) return <p class="note">No products listed yet.</p>;
  return (
    <>
      {result.stale && <p class="note">Showing the last saved list; the shop is offline right now.</p>}
      <div class="products">
        {result.items.map((p) => (
          <ProductCard key={p.id} p={p} accent={shop.colors.accent} />
        ))}
      </div>
    </>
  );
}

export function ShopPanel({ id }: { id: string }) {
  const shop = config.shops.find((s) => s.id === id);
  if (!shop) return null;
  return (
    <Dialog title={shop.name} eyebrow={shop.category} variant="sheet" onClose={() => (panel.value = null)}>
      <div class="shop" style={{ '--shop-accent': shop.colors.accent, '--shop-bg': shop.colors.bg }}>
        {shop.tagline && <p class="shop-tagline">{shop.tagline}</p>}
        {shop.description && <p class="shop-desc">{shop.description}</p>}
        {shop.features.length > 0 && (
          <ul class="shop-features">
            {shop.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        {shop.products && (
          <section aria-label="Products">
            <h3 class="section-title">In the shop</h3>
            <Products shop={shop} />
          </section>
        )}
        {shop.links.length > 0 && (
          <div class="shop-links">
            {shop.links.map((l, i) => (
              <a key={l.url} class={i === 0 ? 'cta cta-primary' : 'cta'} href={l.url} {...external}>
                {l.label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
        <button
          type="button"
          class="cta cta-ghost"
          onClick={() => share(linkUrl({ kind: 'shop', id: shop.id }), `${shop.name} · ${config.mall.name}`)}
        >
          Share this shop
          <IconShare size={18} />
        </button>
      </div>
    </Dialog>
  );
}
