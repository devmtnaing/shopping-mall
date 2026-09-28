// Paints shop signs onto canvases from config data (name, tagline, colours, logo).
// Runs on the main thread during loading: ~1 ms per sign, and it uses the page's web fonts
// directly, including complex scripts like Burmese (the browser does the text shaping).

export type SignSpec = {
  title: string;
  subtitle?: string;
  bg: string;
  accent: string;
  /** Pixel width of the canvas; height follows the sign's aspect ratio. */
  width: number;
  aspect: number;
  logo?: HTMLImageElement | ImageBitmap;
};

const FAMILY = '"Outfit", "Noto Sans Myanmar", system-ui, sans-serif';
/** Scripts that need an extra web font, loaded only when some sign uses them. */
const EXTRA_FONTS: { test: RegExp; family: string; css: string }[] = [
  {
    test: /[က-႟ꩠ-ꩿ]/,
    family: 'Noto Sans Myanmar',
    css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;700&display=swap',
  },
];

/**
 * Largest font size in [min, max] whose text fits `maxWidth`, given a measuring function.
 * Binary search: ~6 measurements instead of trying every size.
 */
export function fitFontSize(
  measure: (size: number) => number,
  maxWidth: number,
  min: number,
  max: number,
): number {
  if (measure(max) <= maxWidth) return max;
  let lo = min;
  let hi = max;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (measure(mid) <= maxWidth) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Make sure every font the given texts need is loaded before painting. */
export async function loadSignFonts(texts: string[]) {
  const all = texts.join(' ');
  const loads = [document.fonts.load(`700 64px "Outfit"`, 'Aa')];
  for (const f of EXTRA_FONTS) {
    if (!f.test.test(all)) continue;
    if (!document.querySelector(`link[data-font="${f.family}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = f.css;
      link.dataset.font = f.family;
      document.head.append(link);
      await new Promise((r) => link.addEventListener('load', r, { once: true }));
    }
    loads.push(document.fonts.load(`700 64px "${f.family}"`, all));
  }
  await Promise.all(loads).catch(() => {}); // offline: fall back to system fonts
}

/** Relative luminance (0 = black, 1 = white) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

export function paintSign(spec: SignSpec): HTMLCanvasElement {
  const w = spec.width;
  const h = Math.round(w / spec.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;

  // panel with a thin accent frame and a glowing underline
  g.fillStyle = spec.bg;
  g.fillRect(0, 0, w, h);
  const frame = Math.max(2, Math.round(h * 0.03));
  g.strokeStyle = spec.accent;
  g.globalAlpha = 0.55;
  g.lineWidth = frame;
  g.strokeRect(frame * 2, frame * 2, w - frame * 4, h - frame * 4);
  g.globalAlpha = 1;

  const pad = h * 0.16;
  let left = pad;
  if (spec.logo) {
    const size = h - pad * 2;
    g.drawImage(spec.logo, left, pad, size, size);
    left += size + pad * 0.7;
  } else {
    // vertical accent bar
    g.fillStyle = spec.accent;
    g.fillRect(left, pad, Math.max(3, h * 0.035), h - pad * 2);
    left += pad * 0.9;
  }
  const maxText = w - left - pad;
  const hasSub = !!spec.subtitle;
  const ink = luminance(spec.bg) > 0.45 ? '#1b1a18' : '#f6f1e7';

  g.textBaseline = 'middle';
  g.fillStyle = ink;
  const titleMax = Math.round(h * (hasSub ? 0.4 : 0.5));
  const titleSize = fitFontSize(
    (s) => {
      g.font = `700 ${s}px ${FAMILY}`;
      return g.measureText(spec.title).width;
    },
    maxText,
    Math.round(h * 0.16),
    titleMax,
  );
  g.font = `700 ${titleSize}px ${FAMILY}`;
  g.fillText(spec.title, left, hasSub ? h * 0.4 : h * 0.5, maxText);

  if (spec.subtitle) {
    const subSize = fitFontSize(
      (s) => {
        g.font = `500 ${s}px ${FAMILY}`;
        return g.measureText(spec.subtitle ?? '').width;
      },
      maxText,
      Math.round(h * 0.09),
      Math.round(h * 0.15),
    );
    g.font = `500 ${subSize}px ${FAMILY}`;
    g.fillStyle = spec.accent;
    g.fillText(spec.subtitle, left, h * 0.74, maxText);
  }
  return canvas;
}
