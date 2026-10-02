// Every HTTP route the server answers, and how it's protected from abuse (docs/deploy.md, "Abuse and
// floods"). server/test/routes.test.ts reads the server's code and fails CI when a route is missing
// here, so a new route can't ship without someone deciding who may call it and what limits it.
//
// `route` is the path exactly as the code compares it: a string, a template, or a regex's source.
// A public route needs a `limit`, and either `edge: true` (Cloudflare's rate-limiting rule covers
// it, so a flood stops before it reaches Railway) or `edgeExempt` saying why it doesn't need to be.
// Cloudflare's free plan matches exact paths only, so an edge route has to be a plain path.
// When the edge list changes, CI opens an issue with the new rule to paste into Cloudflare
// (.github/workflows/cloudflare-rule.yml).

export type Access = 'public' | 'host' | 'owner' | 'host or owner';

export type Route = {
  route: string;
  methods: string[];
  access: Access;
  /** What limits it beyond the general per-IP request limit (server.ts), if anything. */
  limit?: string;
  /** Cloudflare's rate-limiting rule must cover this path. */
  edge?: true;
  /** Why a public route doesn't need Cloudflare's rule. */
  edgeExempt?: string;
};

export const ROUTES: Route[] = [
  // ---- public: anyone on the internet can call these
  {
    route: '/api/rentals',
    methods: ['POST'],
    access: 'public',
    limit: 'apiLimits.rental: 3 per IP, then one every 20 min; 60 an hour in all',
    edge: true,
  },
  {
    route: '/host-token',
    methods: ['POST'],
    access: 'public',
    limit: 'hostSignIns: 5 per IP, then one a minute; 30 a minute in all',
    edge: true,
  },
  {
    route: '/api/owner/sign-in',
    methods: ['POST'],
    access: 'public',
    limit: "apiLimits['sign-in']: 5 per IP, then one a minute",
    edge: true,
  },
  {
    route: '/api/owner/password',
    methods: ['POST'],
    access: 'public',
    limit: "apiLimits['sign-in']",
    edge: true,
  },
  {
    route: '/api/owner/invite',
    methods: ['GET'],
    access: 'public',
    limit: "apiLimits['sign-in'] (each look-up is a guess at a token)",
    edge: true,
  },
  {
    route: '/api/events',
    methods: ['POST'],
    access: 'public',
    limit: 'beacons: 10 per IP, then one every 10 s; extra batches are dropped',
    edgeExempt: 'only logs a line, never stores anything, and drops what is over the limit',
  },
  {
    route: '/api/content',
    methods: ['GET'],
    access: 'public',
    limit: 'kept in memory until the content version changes',
    edgeExempt: 'a read every visitor makes, served from memory',
  },
  {
    route: '/directory/',
    methods: ['GET'],
    access: 'public',
    limit: 'kept in memory until the content version changes',
    edgeExempt: 'a read, served from memory',
  },
  {
    route: '/directory',
    methods: ['GET'],
    access: 'public',
    limit: 'as /directory/',
    edgeExempt: 'a read, served from memory',
  },
  {
    route: '^\\/files\\/([a-z-]+\\/[0-9a-f]{64}\\.(?:png|jpg|webp|glb|json|bin))$',
    methods: ['GET', 'HEAD'],
    access: 'public',
    limit: 'immutable, so Cloudflare caches it',
    edgeExempt: 'served from Cloudflare’s cache',
  },
  {
    route: '/ws',
    methods: ['GET'],
    access: 'public',
    limit: 'connects: 10 per IP, then one every 2 s; MAX_PER_IP open at once; per-message limits',
    edgeExempt: 'a WebSocket: the rule counts requests, and a socket is one request',
  },
  {
    route: '/health',
    methods: ['GET'],
    access: 'public',
    limit: 'none: no database, nothing stored (the health check calls it)',
    edgeExempt: 'cheap, and the health check needs it',
  },

  // ---- the host (HOST_SECRET token)
  { route: '/api/assets', methods: ['GET', 'POST'], access: 'host or owner' },
  { route: '^\\/api\\/assets\\/([0-9a-f-]{36})$', methods: ['DELETE'], access: 'host' },
  { route: '/api/rentals', methods: ['GET'], access: 'host' },
  {
    route: '^\\/api\\/rentals\\/(\\d{1,15})(?:\\/(approve|reject))?$',
    methods: ['POST', 'DELETE'],
    access: 'host',
  },
  { route: '/api/art/mall', methods: ['PUT', 'DELETE'], access: 'host' },
  { route: '/api/mall', methods: ['PUT'], access: 'host' },
  { route: '/api/shops/order', methods: ['POST'], access: 'host' },
  { route: '^\\/api\\/shops\\/([a-z0-9][a-z0-9-]*)$', methods: ['PUT', 'DELETE'], access: 'host' },
  { route: '/api/owners', methods: ['GET'], access: 'host' },
  { route: '^\\/api\\/shops\\/([a-z0-9][a-z0-9-]*)\\/owner$', methods: ['POST', 'DELETE'], access: 'host' },

  // ---- a signed-in shop owner (their own shop only)
  { route: '/api/owner/me', methods: ['GET'], access: 'owner' },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the route as owner-api.ts writes it
  { route: '/api/shops/${shop}', methods: ['PUT'], access: 'owner' },
];

/** The paths Cloudflare's rate-limiting rule covers, in the order they're listed above. */
export function edgePaths(routes: Route[] = ROUTES): string[] {
  return [...new Set(routes.filter((r) => r.edge).map((r) => r.route))];
}

/** The expression for Cloudflare's rate-limiting rule (Security rules → Rate limiting rules). */
export function cloudflareExpression(routes: Route[] = ROUTES): string {
  return `(http.request.uri.path in {${edgePaths(routes)
    .map((p) => `"${p}"`)
    .join(' ')}})`;
}
