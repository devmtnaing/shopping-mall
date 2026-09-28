// Everything uploaded: preview, copy the link, delete.
import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { type Asset, api, fileUrl } from './api';

export function Assets() {
  const list = useSignal<Asset[] | null>(null);
  const error = useSignal('');
  const load = () =>
    api.assets().then(
      (a) => (list.value = a),
      (e: Error) => (error.value = e.message),
    );
  useEffect(() => {
    void load();
  }, []);

  return (
    <section aria-labelledby="files-title">
      <header class="section-head">
        <h2 id="files-title">Files</h2>
      </header>
      <p class="hint">
        Uploaded logos, product images and models. Files are shared: deleting one used by a shop removes it
        from that shop too.
      </p>
      {error.value && <p class="banner error">{error.value}</p>}
      {list.value?.length === 0 && (
        <p class="hint">Nothing uploaded yet. Upload logos and product images from a shop’s editor.</p>
      )}
      <ul class="asset-grid">
        {list.value?.map((a) => (
          <li key={a.id}>
            {a.contentType.startsWith('image/') ? (
              <img src={fileUrl(a.url)} alt="" loading="lazy" />
            ) : (
              <span class="file-kind">{a.kind}</span>
            )}
            <small>
              {a.kind} · {(a.bytes / 1024).toFixed(0)} KB
            </small>
            <span class="actions">
              <button
                type="button"
                class="btn small ghost"
                onClick={() => navigator.clipboard.writeText(a.url)}
              >
                Copy link
              </button>
              <button
                type="button"
                class="btn small danger"
                onClick={async () => {
                  if (!confirm('Delete this file? Shops using it will lose it.')) return;
                  error.value = '';
                  try {
                    await api.deleteAsset(a.id);
                  } catch (e) {
                    error.value = (e as Error).message;
                  }
                  await load();
                }}
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
