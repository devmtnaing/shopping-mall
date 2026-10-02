// Telling the host about a new rental application: a log line (no contact details) and, when
// RENTAL_WEBHOOK is set, a POST with the whole application. `text` and `content` carry a one-line
// summary, so a Slack or Discord incoming webhook shows it as a message as it is. Also the shop an
// approved application opens with.
import type { Shop } from '@shopping-mall/shared/config';
import { CATEGORY_FOR_KIND, type RentalApplication } from '@shopping-mall/shared/rentals';
import { slug } from '@shopping-mall/shared/slug';

export async function notifyRental(a: RentalApplication, webhook: string | undefined) {
  console.log(JSON.stringify({ type: 'rental', id: a.id, slot: a.slot, at: a.createdAt }));
  if (!webhook) return;
  const summary = `New rental application for unit ${a.slot}: ${a.business}, ${CATEGORY_FOR_KIND[a.kind].toLowerCase()} (${a.name}, ${a.email}). Review it in /admin → Rentals.`;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary, content: summary, application: a }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn('rental webhook failed:', (e as Error).message);
  }
}

/**
 * The shop an approved application opens with: its name, type and description, in the colours a
 * new shop gets in /admin. Its owner adds the logo, tagline, links and products themselves.
 */
export function shopFromApplication(a: RentalApplication): Shop {
  return {
    id: slug(a.business) || `shop-${a.slot}`,
    slot: a.slot,
    name: a.business.slice(0, 40).trim(),
    category: CATEGORY_FOR_KIND[a.kind],
    description: a.about.slice(0, 600),
    colors: { bg: '#1c1a17', accent: '#e2b857' },
    features: [],
    links: [],
  };
}
