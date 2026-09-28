// Shop search for the directory: forgiving about case, accents and small typos, and it works
// for any script (Burmese included) because it compares Unicode-normalised text.
import type { Shop } from '@plaza/shared/config';

/** Lowercase, strip accents, collapse spaces. Non-Latin scripts pass through (NFC). */
export function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Are all characters of `q` in `text`, in order? ("lmcf" matches "lumen coffee") */
function subsequence(q: string, text: string): boolean {
  let i = 0;
  for (const ch of text) if (ch === q[i] && ++i === q.length) return true;
  return q.length === 0;
}

/**
 * Score a shop against a query: higher is better, 0 = no match.
 * Name prefix > word prefix > substring anywhere > letters in order.
 */
export function score(shop: Shop, query: string): number {
  const q = fold(query);
  if (!q) return 1;
  const name = fold(shop.name);
  if (name.startsWith(q)) return 100;
  if (name.split(' ').some((w) => w.startsWith(q))) return 80;
  if (name.includes(q)) return 60;
  const rest = fold([shop.tagline, shop.category, shop.description].filter(Boolean).join(' '));
  if (rest.includes(q)) return 40;
  if (q.length >= 3 && subsequence(q.replace(/ /g, ''), name.replace(/ /g, ''))) return 20;
  return 0;
}

/** Shops matching `query`, best first; config order breaks ties. Empty query → all shops. */
export function searchShops(shops: readonly Shop[], query: string): Shop[] {
  return shops
    .map((shop, i) => ({ shop, i, s: score(shop, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.shop);
}
