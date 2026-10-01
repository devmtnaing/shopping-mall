// Photos are shrunk in the browser before they're uploaded: a phone photo is several MB, and every
// stored byte costs hosting. A logo is drawn at most 512 px wide on a sign and a product photo
// a few hundred px in a panel, so this loses nothing anyone sees.

const LONGEST: Record<string, number> = { logo: 512, 'product-image': 900 };

const encode = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((r) => c.toBlob(r, type, quality));

/** A smaller version of an image for `kind`, or the file itself when that's already smaller. */
export async function shrink(file: File, kind: string): Promise<Blob> {
  const longest = LONGEST[kind];
  if (!longest || typeof createImageBitmap !== 'function') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // not an image the browser can read: the server will say so
  const scale = Math.min(1, longest / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  // WebP keeps a logo's transparency and is small. Browsers that can't write it give back a PNG:
  // then photos go as JPEG, and logos stay PNG (they're small, and may be see-through)
  let out = await encode(c, 'image/webp', 0.82);
  if (out?.type !== 'image/webp') out = kind === 'logo' ? out : await encode(c, 'image/jpeg', 0.82);
  return out && out.size < file.size ? out : file;
}
