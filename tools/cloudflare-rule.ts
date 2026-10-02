// node tools/cloudflare-rule.ts [routes.ts] — prints the expression for Cloudflare's rate-limiting
// rule, from server/src/routes.ts or another copy of it (CI compares the one before a change with
// the one after: .github/workflows/cloudflare-rule.yml).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { cloudflareExpression } from '../server/src/routes.ts';

const file = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../server/src/routes.ts'));
const routes = (await import(pathToFileURL(file).href)) as {
  cloudflareExpression: typeof cloudflareExpression;
};
console.log(routes.cloudflareExpression());
