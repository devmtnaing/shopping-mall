import { NAME_MAX, NAME_MIN } from '@plaza/shared/protocol';

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
