import { CHAT_MAX, NAME_MAX, NAME_MIN } from '@shopping-mall/shared/protocol';

/** Clean up a display name: NFC, no control or zero-width characters, single spaces. Null if unusable. */
export function cleanName(raw: string): string | null {
  const name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '') // control + format chars (zero-width joiners, RTL overrides…)
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  return length >= NAME_MIN && length <= NAME_MAX ? name : null;
}

/**
 * A name nobody else in the room is using (ignoring case): the name itself if it's free, otherwise
 * Mingu-2, Mingu-3… shortening the name if the number would take it past NAME_MAX.
 */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const base = [...name]
      .slice(0, NAME_MAX - suffix.length)
      .join('')
      .trimEnd();
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Tidy a chat message: NFC, no control/format characters, single spaces, at most CHAT_MAX characters. */
export function cleanChat(raw: string): string {
  const text = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, CHAT_MAX).join('');
}
