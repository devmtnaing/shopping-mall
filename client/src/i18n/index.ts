// Tiny i18n: string tables per locale, a `locale` signal, and t(). Components that call t()
// re-render when the locale changes, so switching language needs no reload. English ships in the
// first download; other languages load when chosen (English fills in for the moment it takes).

import config from 'virtual:mall-config';
import { computed, signal } from '@preact/signals';
import { loadFontsFor } from '../fonts';
import { load, save } from '../storage';
import { en, type Key } from './en';
import { type Table, translate } from './translate';

const TABLES: Record<string, Table | undefined> = { en };
const LOADERS: Record<string, () => Promise<Table>> = { my: () => import('./my').then((m) => m.my) };
/** Bumped when a table arrives, so everything that called t() re-renders in the new language. */
const arrived = signal(0);
function ensure(l: string): Promise<Table | undefined> {
  const load = LOADERS[l];
  if (TABLES[l] || !load) return Promise.resolve(TABLES[l]);
  return load().then((table) => {
    TABLES[l] = table;
    arrived.value++;
    return table;
  });
}
const NAMES: Record<string, string> = { en: 'English', my: 'မြန်မာ' };

/** Locales this mall offers that we also have strings for. */
export const locales = config.mall.locales.filter((l) => l in TABLES || l in LOADERS);
if (locales.length === 0) locales.push('en');

function initial(): string {
  const saved = load<string>('locale', '');
  if (locales.includes(saved)) return saved;
  for (const l of navigator.languages ?? []) {
    const short = l.toLowerCase().split('-')[0] ?? '';
    if (locales.includes(short)) return short;
  }
  return locales[0] as string;
}

export const locale = signal(initial());
export const localeName = computed(() => NAMES[locale.value] ?? locale.value);

export function setLocale(l: string) {
  if (!locales.includes(l)) return;
  locale.value = l;
  save('locale', l);
}

/** Next locale in the list (for a simple toggle button). */
export function nextLocale() {
  return locales[(locales.indexOf(locale.value) + 1) % locales.length] as string;
}

/** Translate a key, filling {placeholders}. Missing strings fall back to English. */
export function t(key: Key, vars?: Record<string, string>): string {
  arrived.value; // subscribe: re-render once a language's table loads
  return translate(TABLES[locale.value], key, vars);
}

/** Zone display name: translated for known mall areas, as given otherwise. */
export function zoneName(id: string, fallback: string): string {
  const key = `zone.${id}` as Key;
  return key in en ? t(key) : fallback;
}

// keep <html lang> and the script font in step with the chosen locale
locale.subscribe((l) => {
  document.documentElement.lang = l;
  ensure(l)
    .then((table) => loadFontsFor(Object.values(table ?? {}).slice(0, 5)))
    .catch((e) => console.warn(`i18n: ${l}:`, e));
});
