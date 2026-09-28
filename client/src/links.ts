// Shareable links. Query parameters (not paths) so they work on any static host without rewrites:
//   ?s=lumen-coffee          → start at that shop's door with its panel open
//   ?at=12.5,-30.25,1.57,0   → start at x, z, facing yaw (radians), on floor index 0
export type Link =
  | { kind: 'shop'; id: string }
  | { kind: 'at'; x: number; z: number; yaw: number; floor: number };

export function parseLink(search: string): Link | null {
  const q = new URLSearchParams(search);
  const shop = q.get('s');
  if (shop && /^[a-z0-9][a-z0-9-]*$/.test(shop)) return { kind: 'shop', id: shop };
  const at = q.get('at');
  if (at) {
    const n = at.split(',').map(Number);
    const [x, z, yaw = 0, floor = 0] = n;
    if (n.length >= 2 && n.every(Number.isFinite) && x !== undefined && z !== undefined)
      return { kind: 'at', x, z, yaw, floor: Math.max(0, Math.round(floor)) };
  }
  return null;
}

/** Absolute URL for a link, keeping whatever path the app is served from. */
export function linkUrl(link: Link, base = `${location.origin}${location.pathname}`): string {
  if (link.kind === 'shop') return `${base}?s=${encodeURIComponent(link.id)}`;
  const r = (v: number, d: number) => Number(v.toFixed(d));
  return `${base}?at=${[r(link.x, 2), r(link.z, 2), r(link.yaw, 2), link.floor].join(',')}`;
}
