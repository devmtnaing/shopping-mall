// Web fonts. Outfit is always loaded (index.html); script fonts load only when some text needs them.
const SCRIPT_FONTS: { test: RegExp; family: string; css: string }[] = [
  {
    test: /[က-႟ꩠ-ꩿ]/,
    family: 'Noto Sans Myanmar',
    css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;500;700&display=swap',
  },
];

/** Make sure every font the given texts need is loaded. Safe to call repeatedly. */
export async function loadFontsFor(texts: string[]) {
  const all = texts.join(' ');
  const loads = [document.fonts.load('700 64px "Outfit"', 'Aa')];
  for (const f of SCRIPT_FONTS) {
    if (!f.test.test(all)) continue;
    if (!document.querySelector(`link[data-font="${f.family}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = f.css;
      link.dataset.font = f.family;
      document.head.append(link);
      await new Promise((r) => {
        link.addEventListener('load', r, { once: true });
        link.addEventListener('error', r, { once: true });
      });
    }
    loads.push(document.fonts.load(`700 64px "${f.family}"`, all));
  }
  await Promise.all(loads).catch(() => {}); // offline: fall back to system fonts
}
