// Which vacant units already have a rental application waiting: the first applicant holds a unit
// until the host decides, so the mall shows it as requested instead of offering the form.
import { requestedUnits } from '../state';
import { httpUrl } from './socket';

let requestedAt = 0;
/**
 * Refresh which vacant units already have an application waiting (state.requestedUnits). Called
 * when someone walks up to a vacant unit or opens its form; at most every few seconds unless forced.
 */
export async function refreshRequested(force = false) {
  const url = httpUrl('/api/rentals/requested');
  if (!url || (!force && Date.now() - requestedAt < 5000)) return;
  requestedAt = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) requestedUnits.value = ((await res.json()) as { slots: string[] }).slots;
  } catch {
    /* offline: the form still finds out when it sends */
  }
}
