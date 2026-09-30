// Moderation hooks: an optional word blocklist, and reports sent to the log and an optional webhook.
// No word list ships with Shopping Mall; operators provide their own (see server/blocklist.example.txt).
import { readFileSync } from 'node:fs';

export type Blocklist = { words: string[] };

/** Load one word per line (lines starting with # are comments). Missing file → empty list. */
export function loadBlocklist(path: string | undefined): Blocklist {
  if (!path) return { words: [] };
  try {
    const words = readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => fold(l.trim()))
      .filter((l) => l && !l.startsWith('#'));
    return { words };
  } catch {
    console.warn(`blocklist: could not read ${path}; continuing without one`);
    return { words: [] };
  }
}

/** Lowercase, strip accents, and fold look-alike digits so "B4d" matches "bad". */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(
      /[0134578@$]/g,
      (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' })[c] ?? c,
    );
}

/** Does `text` contain a blocked word (as a whole word, ignoring case, accents and l33t digits)? */
export function containsBlocked(list: Blocklist, text: string): boolean {
  if (list.words.length === 0) return false;
  const words = fold(text).split(/[^\p{L}\p{N}]+/u);
  return words.some((w) => list.words.includes(w));
}

/** Replace blocked words with dots, keeping everything else as typed. */
export function maskBlocked(list: Blocklist, text: string): string {
  if (list.words.length === 0) return text;
  return text.replace(/[\p{L}\p{N}@$]+/gu, (w) =>
    list.words.includes(fold(w)) ? '•'.repeat([...w].length) : w,
  );
}

export type Report = {
  at: string;
  room: string;
  reporter: { id: number; name: string };
  reported: { id: number; name: string };
  reason: string;
  recentChat: { name: string; text: string; at: number; host?: boolean }[];
};

/** Log a report, and POST it to `webhook` when configured. Never throws. */
export async function fileReport(report: Report, webhook: string | undefined) {
  console.log(JSON.stringify({ type: 'report', ...report }));
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn('report webhook failed:', (e as Error).message);
  }
}
