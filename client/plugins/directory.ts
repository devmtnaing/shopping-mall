// Renders /directory/index.html at build time from mall.config.ts: every shop, its links and
// products, as plain HTML. No JavaScript, so it works for crawlers, screen readers and devices
// that can't run WebGL. Each shop links back into the 3D mall (?s=<id>).
import type { MallConfig, Shop } from '@shopping-mall/shared/config';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

function price(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function shopSection(shop: Shop, currency: string) {
  const products =
    shop.products?.adapter === 'static' && shop.products.items.length > 0
      ? `<h3>In the shop</h3><ul class="products">${shop.products.items
          .map((p) => {
            const label = `${esc(p.name)} <span class="price">${price(p.price, currency)}</span>${
              p.compareAt ? ` <s>${price(p.compareAt, currency)}</s>` : ''
            }`;
            return `<li>${p.url ? `<a href="${esc(p.url)}" rel="noopener">${label}</a>` : label}</li>`;
          })
          .join('')}</ul>`
      : shop.products
        ? '<p class="muted">Products are listed live in the 3D mall and on the shop’s website.</p>'
        : '';
  const links = shop.links
    .map((l) => `<a class="btn" href="${esc(l.url)}" rel="noopener">${esc(l.label)} ↗</a>`)
    .join('');
  return `<section id="${esc(shop.id)}" style="--accent:${shop.colors.accent};--bg:${shop.colors.bg}">
  <div class="head"><span class="swatch" aria-hidden="true">${esc(shop.name.slice(0, 1))}</span><div>
    ${shop.category ? `<p class="eyebrow">${esc(shop.category)}</p>` : ''}
    <h2>${esc(shop.name)}</h2>
    ${shop.tagline ? `<p class="tagline">${esc(shop.tagline)}</p>` : ''}
  </div></div>
  ${shop.description ? `<p>${esc(shop.description)}</p>` : ''}
  ${shop.features.length ? `<ul class="features">${shop.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
  ${products}
  <p class="links"><a class="btn primary" href="../?s=${encodeURIComponent(shop.id)}">Visit in 3D →</a>${links}</p>
</section>`;
}

export function renderDirectory(config: MallConfig): string {
  const { mall, shops } = config;
  const title = `${mall.name}: shop directory`;
  const description = `${shops.length} shops at ${mall.name}. ${mall.tagline}`.trim();
  return `<!doctype html>
<html lang="${esc(mall.locales[0] ?? 'en')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="theme-color" content="#12110f" />
<link rel="icon" href="../favicon.svg" type="image/svg+xml" />
<style>
:root{--ink:#f6f1e7;--muted:#b9b2a5;--gold:${mall.accent};color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:#12110f;color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
header h1{font-size:clamp(32px,6vw,48px);line-height:1.1;margin:.2em 0}
.eyebrow{margin:0;font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.muted,.tagline{color:var(--muted)}
nav ul{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}
nav a,.btn{display:inline-block;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);color:var(--ink);text-decoration:none}
.btn.primary{background:var(--accent,var(--gold));color:#1b1a18;border-color:transparent;font-weight:700}
section{margin-top:28px;padding:22px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
.head{display:flex;gap:14px;align-items:center}
.swatch{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:12px;background:var(--bg);color:var(--accent);font-weight:700;font-size:20px}
h2{margin:0;font-size:24px}.tagline{margin:2px 0 0;color:var(--accent)}
.features li::marker{color:var(--accent)}
.products{padding:0;list-style:none;display:grid;gap:6px}.products a{color:var(--ink)}
.price{color:var(--accent);font-weight:700}s{color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:0}
a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">Shop directory</p>
  <h1>${esc(mall.name)}</h1>
  ${mall.tagline ? `<p class="muted">${esc(mall.tagline)}</p>` : ''}
  <p><a class="btn primary" href="../">Enter the 3D mall →</a></p>
</header>
<nav aria-label="Shops"><ul>${shops.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.name)}</a></li>`).join('')}</ul></nav>
${shops.map((s) => shopSection(s, mall.currency)).join('\n')}
</main>
</body>
</html>
`;
}
