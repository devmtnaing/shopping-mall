// Which vacant units already have a rental application waiting: the first applicant holds a unit
// until the host decides, so the mall shows it as requested instead of offering the form.
import { requestedUnits } from '../state';
import { httpUrl } from './socket';

/**
 * Refresh which vacant units already have an application waiting (state.requestedUnits), when the
 * rental form opens. The server also sends the list on joining and after every change.
 */
export async function refreshRequested() {
  const url = httpUrl('/api/rentals/requested');
  if (!url) return;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) requestedUnits.value = ((await res.json()) as { slots: string[] }).slots;
  } catch {
    /* offline: the form still finds out when it sends */
  }
}
