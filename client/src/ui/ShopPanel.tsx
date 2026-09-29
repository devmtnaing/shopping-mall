import { track } from '../analytics';
// The shop panel: who they are, what they sell, where to go next. Plain DOM, no three.js,
// so it also works for visitors whose device can't run WebGL.

import type { Shop } from '@shopping-mall/shared/config';
import { useEffect, useState } from 'preact/hooks';
import { content } from '../content';
import { locale, t } from '../i18n';
import { linkUrl } from '../links';
import { formatPrice, loadProducts, type Product, type ProductsResult } from '../shops/products';
import { panel } from '../state';
import { Dialog } from './Dialog';
import { IconShare } from './icons';
import { share } from './share';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

function ProductCard({ p, accent, shop }: { p: Product; accent: string; shop: string }) {
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
        {formatPrice(p.price, content.value.mall.currency, locale.value)}
        {p.compareAt && <s>{formatPrice(p.compareAt, content.value.mall.currency, locale.value)}</s>}
      </div>
    </>
  );
  return p.url ? (
    <a class="product" href={p.url} {...external} onClick={() => track({ e: 'product', shop })}>
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
  if (result.status === 'error') return <p class="note">{t('shop.productsError')}</p>;
  if (result.items.length === 0) return <p class="note">{t('shop.noProducts')}</p>;
  return (
    <>
      {result.stale && <p class="note">{t('shop.stale')}</p>}
      <div class="products">
        {result.items.map((p) => (
          <ProductCard key={p.id} p={p} accent={shop.colors.accent} shop={shop.id} />
        ))}
      </div>
    </>
  );
}

export function ShopPanel({ id }: { id: string }) {
  const shop = content.value.shops.find((s) => s.id === id);
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
            <h3 class="section-title">{t('shop.inTheShop')}</h3>
            <Products shop={shop} />
          </section>
        )}
        {shop.links.length > 0 && (
          <div class="shop-links">
            {shop.links.map((l, i) => (
              <a
                key={l.url}
                class={i === 0 ? 'cta cta-primary' : 'cta'}
                href={l.url}
                {...external}
                onClick={() => track({ e: 'link', shop: shop.id, label: l.label.slice(0, 64) })}
              >
                {l.label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
        <button
          type="button"
          class="cta cta-ghost"
          onClick={() =>
            share(linkUrl({ kind: 'shop', id: shop.id }), `${shop.name} · ${content.value.mall.name}`)
          }
        >
          {t('shop.share')}
          <IconShare size={18} />
        </button>
      </div>
    </Dialog>
  );
}
