// pnpm size — checks client/dist against budgets.json (gzipped bytes). Exits 1 when over budget.
// "Initial JS" = the entry chunk plus every chunk it imports statically (from Vite's manifest).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

type Chunk = { file: string; isEntry?: boolean; imports?: string[]; css?: string[] };

const dist = resolve(import.meta.dirname, '../client/dist');
const budgets = JSON.parse(readFileSync(resolve(import.meta.dirname, '../budgets.json'), 'utf8'));
const manifest: Record<string, Chunk> = JSON.parse(readFileSync(`${dist}/.vite/manifest.json`, 'utf8'));

const gz = (file: string) => gzipSync(readFileSync(`${dist}/${file}`), { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

const initial = new Set<string>();
const css = new Set<string>();
const visit = (key: string) => {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  initial.add(chunk.file);
  for (const c of chunk.css ?? []) css.add(c);
  for (const i of chunk.imports ?? []) visit(i);
};
for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);

const rows: [string, number, number][] = [];
const sum = (files: Iterable<string>) => [...files].reduce((n, f) => n + gz(f), 0);
rows.push(['initial JS', sum(initial), budgets.initialJs]);
rows.push(['CSS', sum(css), budgets.css]);
for (const chunk of Object.values(manifest)) {
  if (chunk.file.endsWith('.js') && !initial.has(chunk.file))
    rows.push([`lazy ${chunk.file}`, gz(chunk.file), budgets.anyLazyChunk]);
}

let failed = false;
console.log('| item | gzip | budget | |\n|---|---:|---:|---|');
for (const [name, size, budget] of rows) {
  const ok = size <= budget;
  failed ||= !ok;
  console.log(`| ${name} | ${kb(size)} | ${kb(budget)} | ${ok ? '✅' : '❌'} |`);
}
if (failed) {
  console.error(
    '\nOver budget. Fix the regression or raise budgets.json with a reason (docs/performance.md).',
  );
  process.exit(1);
}
