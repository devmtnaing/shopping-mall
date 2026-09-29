// Anonymous usage events (T-603): what the client may send to POST /api/events. No personal data,
// no identifiers: just what happened. The server validates against this and logs one JSON line each.
export const EVENT_NAMES = ['visit', 'enter', 'shop', 'link', 'product', 'leave'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** One event. Values are short strings or numbers; `shop` is a shop id, never a person. */
export type UsageEvent = {
  e: EventName;
  /** visit: UI language and quality tier; touch device or not */
  locale?: string;
  tier?: string;
  touch?: boolean;
  /** enter: ms from page load to playable */
  ms?: number;
  /** shop, link, product: which shop (id) and, for links, the button label */
  shop?: string;
  label?: string;
  /** leave: seconds on the page */
  s?: number;
};

export const MAX_EVENTS_PER_BATCH = 30;
