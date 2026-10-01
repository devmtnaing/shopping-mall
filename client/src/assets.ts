// URLs for the files under public/assets (models, sounds, portraits), with a fingerprint of the
// file's contents (vite.config.ts writes them into the page) so caches can keep each for good.
const versions: Record<string, string> = (() => {
  try {
    return JSON.parse(document.getElementById('asset-versions')?.textContent || '{}');
  } catch {
    return {};
  }
})();

/** `path` is relative to assets/, e.g. "mall/mall.glb". */
export function asset(path: string): string {
  const v = versions[path];
  return `${import.meta.env.BASE_URL}assets/${path}${v ? `?v=${v}` : ''}`;
}
