// Tiny i18n: string tables per locale, a `locale` signal, and t(). Components that call t()
// re-render when the locale changes, so switching language needs no reload.

import config from 'virtual:mall-config';
import { computed, signal } from '@preact/signals';
import { loadFontsFor } from '../fonts';
import { load, save } from '../storage';
import { en, type Key } from './en';
import { my } from './my';
import { type Table, translate } from './translate';

const TABLES: Record<string, Table> = { en, my };
const NAMES: Record<string, string> = { en: 'English', my: 'မြန်မာ' };

/** Locales this mall offers that we also have strings for. */
export const locales = config.mall.locales.filter((l) => l in TABLES);
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
  loadFontsFor(Object.values(TABLES[l] ?? {}).slice(0, 5));
});
