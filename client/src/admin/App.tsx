// The admin: sign in with the host password, then manage shops, the mall and uploaded files.
// Every save goes live in the mall straight away (the server tells visitors to refetch).
// Shop owners use the same app at /shop-admin/, where signing in is with their email and password.

import { useSignal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { MallArt, MallMeta } from '@shopping-mall/shared/meta';
import type { OwnerInfo } from '@shopping-mall/shared/owners';
import type { RemovedShop, RentalApplication } from '@shopping-mall/shared/rentals';
import { CATEGORY_FOR_KIND } from '@shopping-mall/shared/shop-kinds';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { Assets } from './Assets';
import { api, fileUrl, ownShop, token } from './api';
import { Building } from './Building';
import { MallForm } from './MallForm';
import { OwnerAdmin, SetPassword } from './Owner';
import { OwnerAccess } from './OwnerAccess';
import { RemovedShops } from './RemovedShops';
import { Rentals } from './Rentals';
import { ShopEditor, slotLabel } from './ShopEditor';
import { ShopList } from './ShopList';
import './admin.css';

/** Shop owners' door (/shop-admin/); the host's is /admin/. */
const forOwners = location.pathname.startsWith('/shop-admin');
const OTHER_DOOR = forOwners
  ? { href: '/admin/', label: 'The mall’s host? Sign in here' }
  : { href: '/shop-admin/', label: 'Look after a shop? Sign in here' };

function SignIn() {
  const owner = forOwners;
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
          if (owner) await api.ownerSignIn(email.value.trim(), secret.value);
          else await api.signIn(secret.value);
        } catch (x) {
          error.value = (x as Error).message;
        }
      }}
    >
      <h1>{owner ? 'Your shop' : 'Mall admin'}</h1>
      <p>
        {owner
          ? 'Sign in with your email and the password you set, to look after your shop.'
          : 'Sign in with the host password to edit shops, products and files.'}
      </p>
      {owner && (
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
      <label for="secret">{owner ? 'Password' : 'Host password'}</label>
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
      {owner && <small class="hint">Forgot your password? Ask the mall’s host for a new link.</small>}
      <a class="link-btn" href={OTHER_DOOR.href}>
        {OTHER_DOOR.label}
      </a>
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
  const removed = useSignal<RemovedShop[]>([]);
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
  const loadRemoved = async () => {
    try {
      removed.value = await api.removedShops();
    } catch {
      /* the list just stays as it was */
    }
  };
  useEffect(() => {
    void load();
    void loadRentals();
    void loadOwners();
    void loadRemoved();
    // new applications, and news of the emails sent (a bounce can take a shop out on its own)
    const timer = setInterval(() => {
      void loadRentals();
      void loadOwners();
      void loadRemoved();
    }, RENTALS_POLL_MS);
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
              const reason = prompt(
                `Remove ${s.name} from the mall? Its unit is for rent again, and a copy is kept under Removed shops.\n\nWhy is it being removed?`,
                '',
              );
              if (reason === null) return;
              if (!reason.trim()) return alert('Say why it’s being removed, so it’s on record.');
              try {
                await api.removeShop(s.id, reason.trim());
              } catch (e) {
                return alert((e as Error).message);
              }
              await Promise.all([load(), loadOwners(), loadRemoved()]);
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
        {c && tab.value === 'shops' && editing.value === null && (
          <RemovedShops
            shops={removed.value}
            unit={(id) => {
              const s = slots.value.find((x) => x.id === id);
              return s ? slotLabel(s) : id;
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

/** A set-password link (/shop-admin/?invite=…), read once; the address bar loses it after use. */
const inviteParam = new URLSearchParams(location.search).get('invite');
// links sent before owners had their own page went to /admin/?invite=…
if (inviteParam && !forOwners) location.replace(`/shop-admin/${location.search}`);

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
