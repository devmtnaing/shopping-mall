// Anonymous usage events (T-603, docs/privacy.md): what happened, never who. Batched and sent with
// sendBeacon when the page is hidden (and every 30 s), to the mall's own server, which only logs
// them. No cookies, no ids, no third parties. Off when the browser asks not to be tracked (Do Not
// Track or Global Privacy Control), or when there's no server.
import { MAX_EVENTS_PER_BATCH, type UsageEvent } from '@shopping-mall/shared/events';
import { httpUrl } from './net/socket';

const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
const url = httpUrl('/api/events');
const enabled = !!url && nav.doNotTrack !== '1' && !nav.globalPrivacyControl;
let queue: UsageEvent[] = [];

export function track(ev: UsageEvent) {
  if (!enabled || queue.length >= MAX_EVENTS_PER_BATCH) return;
  queue.push(ev);
}

function flush() {
  if (!queue.length || !url) return;
  navigator.sendBeacon(url, JSON.stringify(queue));
  queue = [];
}

if (enabled) {
  const start = performance.now();
  addEventListener('pagehide', () => {
    track({ e: 'leave', s: Math.round((performance.now() - start) / 1000) });
    flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  setInterval(flush, 30_000);
}
