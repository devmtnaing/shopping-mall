// Telling the host about a new rental application: a log line (no contact details) and, when
// RENTAL_WEBHOOK is set, a POST with the whole application. `text` and `content` carry a one-line
// summary, so a Slack or Discord incoming webhook shows it as a message as it is.
import { CATEGORY_FOR_KIND, type RentalApplication } from '@shopping-mall/shared/rentals';

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
