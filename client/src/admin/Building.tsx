// The mall building: keep the built-in one or upload your own package (model, collision, meta).
// The server checks the package fits (every shop keeps its unit, people can walk from the spawn
// and between floors) and bakes the navgrid. Visitors get the new building on their next visit.

import { useSignal } from '@preact/signals';
import type { MallArt } from '@shopping-mall/shared/meta';
import { type ApiError, api, type FieldError } from './api';

const PARTS = [
  { key: 'model', kind: 'mall-model', label: 'Visual model (.glb)', accept: '.glb' },
  { key: 'collision', kind: 'mall-collision', label: 'Collision model (.glb)', accept: '.glb' },
  { key: 'meta', kind: 'mall-meta', label: 'Meta (mall.meta.json)', accept: '.json,application/json' },
] as const;
type Part = (typeof PARTS)[number]['key'];

export function Building({ art, onSaved }: { art: MallArt | null; onSaved: () => void }) {
  const files = useSignal<Partial<Record<Part, File>>>({});
  const status = useSignal('');
  const failed = useSignal(false);
  const fields = useSignal<FieldError[]>([]);
  const busy = useSignal(false);
  const ready = PARTS.every((p) => files.value[p.key]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    busy.value = true;
    failed.value = false;
    fields.value = [];
    status.value = label;
    try {
      await work();
      status.value = 'Done. Visitors get the new building on their next visit.';
      files.value = {};
      onSaved();
    } catch (x) {
      failed.value = true;
      fields.value = (x as ApiError).fields ?? [];
      status.value = (x as Error).message;
    } finally {
      busy.value = false;
    }
  };

  return (
    <form
      class="editor"
      aria-labelledby="building-title"
      onSubmit={(e) => {
        e.preventDefault();
        void run('Uploading and checking the building…', async () => {
          const ids = {} as Record<Part, string>;
          for (const p of PARTS) ids[p.key] = (await api.upload(p.kind, files.value[p.key] as File)).id;
          await api.replaceArt(ids);
        });
      }}
    >
      <header class="editor-head">
        <h2 id="building-title">Building</h2>
        <button type="submit" class="btn primary" disabled={!ready || busy.value}>
          Replace the building
        </button>
      </header>
      <p class="hint">
        {art ? 'This mall uses an uploaded building.' : 'This mall uses the built-in greybox building.'} A
        building is three files exported together: see <code>docs/art-direction.md</code> for the format.
        Shops keep their units, so the new meta needs a unit for every shop.
      </p>
      {/* always mounted: inserting it would shift the file inputs and clear what was picked */}
      <div class={!status.value ? undefined : failed.value ? 'banner error' : 'banner'} role="status">
        {status.value}
        {fields.value.length > 0 && (
          <ul>
            {fields.value.slice(0, 8).map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>: {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="grid">
        {PARTS.map((p) => (
          <div class="field" key={p.key}>
            <label for={`art-${p.key}`}>{p.label}</label>
            <input
              id={`art-${p.key}`}
              type="file"
              accept={p.accept}
              disabled={busy.value}
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                files.value = { ...files.value, [p.key]: f };
              }}
            />
          </div>
        ))}
      </div>
      {art && (
        <p>
          <button
            type="button"
            class="btn small danger"
            disabled={busy.value}
            onClick={() => {
              if (!confirm('Go back to the built-in building? The uploaded files stay in Files.')) return;
              void run('Switching back…', () => api.resetArt());
            }}
          >
            Use the built-in building
          </button>
        </p>
      )}
    </form>
  );
}
