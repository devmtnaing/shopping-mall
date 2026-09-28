// Tiny wrapper around localStorage for per-visitor conveniences (name, look). Storage can be
// missing or throw (private mode, blocked site data), so every access is guarded.
const PREFIX = 'shopping-mall:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* not available: the visitor just won't be remembered */
  }
}
