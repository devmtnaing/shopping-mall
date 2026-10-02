// The admin: sign in with the host password, then manage shops, the mall and uploaded files.
// Every save goes live in the mall straight away (the server tells visitors to refetch).

import { useSignal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { MallArt, MallMeta } from '@shopping-mall/shared/meta';
import type { OwnerInfo } from '@shopping-mall/shared/owners';
import type { RentalApplication } from '@shopping-mall/shared/rentals';
import { CATEGORY_FOR_KIND } from '@shopping-mall/shared/shop-kinds';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { Assets } from './Assets';
import { api, fileUrl, ownShop, token } from './api';
import { Building } from './Building';
import { MallForm } from './MallForm';
import { OwnerAdmin, SetPassword } from './Owner';
import { OwnerAccess } from './OwnerAccess';
import { Rentals } from './Rentals';
import { ShopEditor } from './ShopEditor';
import { ShopList } from './ShopList';
import './admin.css';

function SignIn() {
  const owner = useSignal(false);
  const email = useSignal('');
  const secret = useSignal('');
  const error = useSignal('');
  return (
    <form
      class="signin"
      onSubmit={async (e) => {
        e.preventDefault();
        error.value = '';
        try {
          if (owner.value) await api.ownerSignIn(email.value.trim(), secret.value);
          else await api.signIn(secret.value);
        } catch (x) {
          error.value = (x as Error).message;
        }
      }}
    >
      <h1>{owner.value ? 'Your shop' : 'Mall admin'}</h1>
      <p>
        {owner.value
          ? 'Sign in with your email and the password you set, to look after your shop.'
          : 'Sign in with the host password to edit shops, products and files.'}
      </p>
      {owner.value && (
        <>
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email.value}
            onInput={(e) => (email.value = (e.target as HTMLInputElement).value)}
          />
        </>
      )}
      <label for="secret">{owner.value ? 'Password' : 'Host password'}</label>
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
      <button
        type="button"
        class="link-btn"
        onClick={() => {
          owner.value = !owner.value;
          error.value = '';
        }}
      >
        {owner.value ? 'I’m the mall’s host' : 'I look after a shop'}
      </button>
      {owner.value && <small class="hint">Forgot your password? Ask the mall’s host for a new link.</small>}
    </form>
  );
}

type Tab = 'shops' | 'rentals' | 'mall' | 'building' | 'files';
const TABS: Record<Tab, string> = {
  shops: 'Shops',
  rentals: 'Rentals',
  mall: 'Mall',
  building: 'Building',
  files: 'Files',
};
/** How often to look for new rental applications while the admin is open. */
const RENTALS_POLL_MS = 30_000;
const BUILT_IN_META = '/assets/mall/mall.meta.json';

function Admin() {
  const cfg = useSignal<MallConfig | null>(null);
  const art = useSignal<MallArt | null>(null);
  const slots = useSignal<MallMeta['slots']>([]);
  const tab = useSignal<Tab>('shops');
  const editing = useSignal<Shop | 'new' | null>(null);
  const rentals = useSignal<RentalApplication[]>([]);
  const prefill = useSignal<RentalApplication | null>(null);
  const owners = useSignal<OwnerInfo[]>([]);
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
  const loadOwners = async () => {
    try {
      owners.value = await api.owners();
    } catch {
      /* the shop editor just shows no owner */
    }
  };
  const loadRentals = async () => {
    try {
      rentals.value = await api.rentals();
    } catch {
      /* shown as no news; the next poll tries again */
    }
  };
  useEffect(() => {
    void load();
    void loadRentals();
    void loadOwners();
    const timer = setInterval(loadRentals, RENTALS_POLL_MS);
    return () => clearInterval(timer);
  }, []);
  const pending = rentals.value.filter((r) => r.status === 'pending').length;
  // the tab title shows waiting applications, so they're noticed from another tab
  useEffect(() => {
    document.title = `${pending ? `(${pending}) ` : ''}Mall admin`;
  }, [pending]);

  const c = cfg.value;
  const taken = new Map((c?.shops ?? []).map((s) => [s.slot, s.id]));
  const done = async (saved: Shop) => {
    const fromRental = prefill.value !== null;
    editing.value = null;
    prefill.value = null;
    await load();
    // a shop made from a rental application stays open, so the host can invite its owner next
    if (fromRental) editing.value = cfg.value?.shops.find((s) => s.id === saved.id) ?? null;
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
                prefill.value = null;
              }}
            >
              {TABS[t]}
              {t === 'rentals' && pending > 0 && (
                <span class="badge" role="status" aria-label={`${pending} waiting`}>
                  {pending}
                </span>
              )}
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
            prefill={
              editing.value === 'new' && prefill.value
                ? {
                    slot: prefill.value.slot,
                    name: prefill.value.business,
                    category: CATEGORY_FOR_KIND[prefill.value.kind],
                    description: prefill.value.about,
                  }
                : undefined
            }
            slots={slots.value}
            taken={taken}
            onSaved={done}
            onCancel={() => {
              editing.value = null;
              prefill.value = null;
            }}
          />
        )}
        {c && tab.value === 'shops' && editing.value !== null && editing.value !== 'new' && (
          <OwnerAccess
            key={editing.value.id}
            shop={editing.value.id}
            owner={owners.value.find((o) => o.shop === (editing.value as Shop).id)}
            suggestedEmail={
              rentals.value.find((r) => r.status === 'approved' && r.slot === (editing.value as Shop).slot)
                ?.email
            }
            onChanged={loadOwners}
          />
        )}
        {c && tab.value === 'rentals' && (
          <Rentals
            rentals={rentals.value}
            slots={slots.value}
            shops={c.shops}
            owners={owners.value}
            onChanged={loadRentals}
            onOwnersChanged={loadOwners}
            onShopsChanged={load}
            onCreateShop={(a) => {
              prefill.value = a;
              editing.value = 'new';
              tab.value = 'shops';
            }}
          />
        )}
        {c && tab.value === 'mall' && <MallForm mall={c.mall} onSaved={load} />}
        {c && tab.value === 'building' && <Building art={art.value} onSaved={load} />}
        {tab.value === 'files' && <Assets />}
      </main>
    </div>
  );
}

/** A set-password link (/admin/?invite=…), read once; the address bar loses it after use. */
const inviteParam = new URLSearchParams(location.search).get('invite');

function App() {
  const invite = useSignal(inviteParam);
  if (invite.value && !token.value)
    return (
      <SetPassword
        invite={invite.value}
        onDone={() => {
          history.replaceState(null, '', location.pathname);
          invite.value = null;
        }}
      />
    );
  if (!token.value) return <SignIn />;
  return ownShop.value ? <OwnerAdmin /> : <Admin />;
}

export function mountAdmin(el: HTMLElement) {
  render(<App />, el);
}
