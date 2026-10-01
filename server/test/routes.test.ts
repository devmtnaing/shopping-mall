// The abuse gate (server/src/routes.ts): every route in the server's code is declared there, every
// public one says what limits it, and Cloudflare's rule in docs/deploy.md matches the edge list.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloudflareExpression, ROUTES } from '../src/routes';

const ROOT = resolve(import.meta.dirname, '../..');
const SRC = resolve(ROOT, 'server/src');

/** Paths the code compares a request's URL with: `path === '/api/x'`, `` path === `/api/shops/${shop}` ``. */
const COMPARED = /[!=]==\s*(['`])(\/[^'`\n]*)\1/g;
/** Route regexes: `/^\/api\/shops\/(…)$/` (a regex that starts with a slash and is anchored at both ends). */
const PATTERN = /\/(\^\\\/[a-z][^\n]*?\$)\//g;

type Found = { route: string; at: string };

function scan(): Found[] {
  const found: Found[] = [];
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (f) => f.endsWith('.ts') && f !== 'routes.ts',
  );
  for (const file of files) {
    const lines = readFileSync(join(SRC, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const at = `${relative(ROOT, join(SRC, file))}:${i + 1}`;
      for (const m of line.matchAll(COMPARED)) found.push({ route: m[2] as string, at });
      for (const m of line.matchAll(PATTERN)) found.push({ route: m[1] as string, at });
    });
  }
  return found;
}

describe('the abuse gate (server/src/routes.ts)', () => {
  const found = scan();
  const declared = new Set(ROUTES.map((r) => r.route));

  it('finds the routes in the code', () => {
    // a sanity check on the scan itself: if it finds nothing, the patterns above have gone stale
    expect(found.map((f) => f.route)).toEqual(expect.arrayContaining(['/api/rentals', '/ws', '/health']));
  });

  it('has every route in the code declared, with who may call it and what limits it', () => {
    const missing = found.filter((f) => !declared.has(f.route));
    const help = missing.map((f) => `  ${f.route}   (${f.at})`).join('\n');
    expect(
      missing,
      `New route(s) not in server/src/routes.ts:\n${help}\n` +
        'Add each one there: its methods, who may call it, and, if anyone may, what limits it and ' +
        'whether Cloudflare’s rate-limiting rule should cover it (edge) or why not (edgeExempt).',
    ).toEqual([]);
  });

  it('has nothing declared that the code no longer answers', () => {
    const inCode = new Set(found.map((f) => f.route));
    const stale = ROUTES.filter((r) => !inCode.has(r.route)).map((r) => r.route);
    expect(stale, 'Remove these from server/src/routes.ts: the code no longer has them.').toEqual([]);
  });

  it('says how every public route is limited, and whether Cloudflare covers it', () => {
    for (const r of ROUTES.filter((x) => x.access === 'public')) {
      expect(r.limit, `${r.route}: say what limits it (limit)`).toBeTruthy();
      expect(
        !!r.edge !== !!r.edgeExempt,
        `${r.route}: set either edge: true (Cloudflare's rule covers it) or edgeExempt: '<why not>'`,
      ).toBe(true);
    }
  });

  it('only puts plain paths in Cloudflare’s rule (the free plan matches exact paths)', () => {
    for (const r of ROUTES.filter((x) => x.edge)) {
      expect(r.access, `${r.route}: only public routes need the edge rule`).toBe('public');
      expect(r.route, `${r.route}: Cloudflare's free plan can't match a pattern`).toMatch(/^\/[a-z0-9/_-]+$/);
    }
  });

  it('has the current Cloudflare rule in docs/deploy.md', () => {
    const docs = readFileSync(resolve(ROOT, 'docs/deploy.md'), 'utf8');
    expect(
      docs.includes(cloudflareExpression()),
      'The edge routes changed: put this expression in docs/deploy.md ("Abuse and floods"), and ' +
        `update the rule in Cloudflare after merging:\n  ${cloudflareExpression()}`,
    ).toBe(true);
  });
});
