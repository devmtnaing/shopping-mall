import { en, type Key } from './en';

export type Table = Partial<Record<Key, string>>;

/** Look up `key` in `table` (falling back to English) and fill {placeholders}. */
export function translate(table: Table | undefined, key: Key, vars?: Record<string, string>): string {
  let s = table?.[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
