// The admin: sign in with the host password, then manage shops, the mall and uploaded files.
// Every save goes live in the mall straight away (the server tells visitors to refetch).

import { useSignal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { MallArt, MallMeta } from '@shopping-mall/shared/meta';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { Assets } from './Assets';
import { api, fileUrl, token } from './api';
import { Building } from './Building';
import { MallForm } from './MallForm';
import { ShopEditor } from './ShopEditor';
import { ShopList } from './ShopList';
import './admin.css';

function SignIn() {
  const secret = useSignal('');
  const error = useSignal('');
  return (
    <form
      class="signin"
      onSubmit={async (e) => {
        e.preventDefault();
        error.value = '';
        try {
          await api.signIn(secret.value);
        } catch (x) {
          error.value = (x as Error).message;
        }
      }}
    >
      <h1>Mall admin</h1>
      <p>Sign in with the host password to edit shops, products and files.</p>
      <label for="secret">Host password</label>
      <input
        id="secret"
        type="password"
        autoComplete="current-password"
        value={secret.value}
        onInput={(e) => (secret.value = (e.target as HTMLInputElement).value)}
      />
      {error.value && (
        <p class="error" role="alert">
          {error.value}
        </p>
      )}
      <button type="submit" class="btn primary">
        Sign in
      </button>
    </form>
  );
}

type Tab = 'shops' | 'mall' | 'building' | 'files';
const TABS: Record<Tab, string> = { shops: 'Shops', mall: 'Mall', building: 'Building', files: 'Files' };
const BUILT_IN_META = '/assets/mall/mall.meta.json';

function Admin() {
  const cfg = useSignal<MallConfig | null>(null);
  const art = useSignal<MallArt | null>(null);
  const slots = useSignal<MallMeta['slots']>([]);
  const tab = useSignal<Tab>('shops');
  const editing = useSignal<Shop | 'new' | null>(null);
  const error = useSignal('');

  const load = async () => {
    try {
      const body = await api.content();
      cfg.value = body.config;
      art.value = body.art ?? null;
      // units come from the building's meta (uploaded or built-in)
      const meta = (await (await fetch(fileUrl(art.value?.meta) || BUILT_IN_META)).json()) as MallMeta;
      slots.value = meta.slots;
    } catch (e) {
      error.value = (e as Error).message;
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const c = cfg.value;
  const taken = new Map((c?.shops ?? []).map((s) => [s.slot, s.id]));
  const done = async () => {
    editing.value = null;
    await load();
  };

  return (
    <div class="admin">
      <header class="topbar">
        <strong>{c?.mall.name ?? 'Mall'} · admin</strong>
        <nav aria-label="Sections">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              class={tab.value === t ? 'tab on' : 'tab'}
              aria-current={tab.value === t ? 'page' : undefined}
              onClick={() => {
                tab.value = t;
                editing.value = null;
              }}
            >
              {TABS[t]}
            </button>
          ))}
        </nav>
        <a class="btn small ghost" href="/" target="_blank" rel="noopener">
          Open the mall ↗
        </a>
      </header>
      <main>
        {error.value && <p class="banner error">{error.value}</p>}
        {!c && !error.value && <p class="hint">Loading…</p>}
        {c && tab.value === 'shops' && editing.value === null && (
          <ShopList
            shops={c.shops}
            slots={slots.value}
            onAdd={() => (editing.value = 'new')}
            onEdit={(s) => (editing.value = s)}
            onDelete={async (s) => {
              if (!confirm(`Delete ${s.name}? Its unit becomes free and its products are removed.`)) return;
              await api.deleteShop(s.id);
              await load();
            }}
            onMove={async (from, to) => {
              const ids = c.shops.map((s) => s.id);
              const [moved] = ids.splice(from, 1);
              ids.splice(to, 0, moved as string);
              await api.reorder(ids);
              await load();
            }}
          />
        )}
        {c && tab.value === 'shops' && editing.value !== null && (
          <ShopEditor
            key={editing.value === 'new' ? 'new' : editing.value.id}
            shop={editing.value === 'new' ? undefined : editing.value}
            slots={slots.value}
            taken={taken}
            onSaved={done}
            onCancel={() => (editing.value = null)}
          />
        )}
        {c && tab.value === 'mall' && <MallForm mall={c.mall} onSaved={load} />}
        {c && tab.value === 'building' && <Building art={art.value} onSaved={load} />}
        {tab.value === 'files' && <Assets />}
      </main>
    </div>
  );
}

function App() {
  return token.value ? <Admin /> : <SignIn />;
}

export function mountAdmin(el: HTMLElement) {
  render(<App />, el);
}
