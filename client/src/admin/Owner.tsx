// Shop owners at /shop-admin/: the set-password page their invite link opens, and their own view once
// signed in: just their shop, in the same editor the host uses (with the unit locked and limits).

import { useSignal } from '@preact/signals';
import type { MallConfig, Shop } from '@shopping-mall/shared/config';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { OWNER_LIMITS } from '@shopping-mall/shared/owners';
import { useEffect } from 'preact/hooks';
import { api, fileUrl, ownShop, signOut } from './api';
import { ShopEditor } from './ShopEditor';

const BUILT_IN_META = '/assets/mall/mall.meta.json';

/** Opened from the invite link (/shop-admin/?invite=…): choose a password, and you're in. */
export function SetPassword({ invite, onDone }: { invite: string; onDone: () => void }) {
  const who = useSignal<{ email: string; name: string } | null>(null);
  const password = useSignal('');
  const again = useSignal('');
  const error = useSignal('');
  const busy = useSignal(false);
  useEffect(() => {
    api.invite(invite).then(
      (r) => (who.value = r),
      (e) => (error.value = (e as Error).message),
    );
  }, [invite]);

  return (
    <form
      class="signin"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.value !== again.value) {
          error.value = 'The two passwords are different.';
          return;
        }
        busy.value = true;
        error.value = '';
        try {
          await api.setPassword(invite, password.value);
          onDone();
        } catch (x) {
          error.value = (x as Error).message;
        } finally {
          busy.value = false;
        }
      }}
    >
      <h1>{who.value ? `Welcome to ${who.value.name}` : 'Set your password'}</h1>
      {who.value && (
        <>
          <p>
            Choose a password for <strong>{who.value.email}</strong>. You’ll sign in with that email and this
            password to look after your shop.
          </p>
          <input type="email" autoComplete="username" value={who.value.email} hidden readOnly />
          <label for="pw">New password</label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            minLength={OWNER_LIMITS.passwordMin}
            required
            value={password.value}
            onInput={(e) => (password.value = (e.target as HTMLInputElement).value)}
          />
          <small class="hint">At least {OWNER_LIMITS.passwordMin} characters.</small>
          <label for="pw2">The same password again</label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            required
            value={again.value}
            onInput={(e) => (again.value = (e.target as HTMLInputElement).value)}
          />
        </>
      )}
      {error.value && (
        <p class="error" role="alert">
          {error.value}
        </p>
      )}
      {who.value && (
        <button type="submit" class="btn primary" disabled={busy.value}>
          {busy.value ? 'Saving…' : 'Set password and open my shop'}
        </button>
      )}
    </form>
  );
}

/** A signed-in shop owner's admin: their shop, nothing else. */
export function OwnerAdmin() {
  const shopId = ownShop.value as string;
  const shop = useSignal<Shop | null>(null);
  const mall = useSignal<MallConfig['mall'] | null>(null);
  const slots = useSignal<MallMeta['slots']>([]);
  const error = useSignal('');
  const saved = useSignal(false);
  const round = useSignal(0); // a new editor (fresh draft) after saving or undoing

  const load = async () => {
    try {
      const body = await api.content();
      mall.value = body.config.mall;
      shop.value = body.config.shops.find((s) => s.id === shopId) ?? null;
      if (!shop.value) error.value = 'Your shop isn’t in the mall any more. Ask the mall’s host.';
      const meta = (await (await fetch(fileUrl(body.art?.meta) || BUILT_IN_META)).json()) as MallMeta;
      slots.value = meta.slots;
    } catch (e) {
      error.value = (e as Error).message;
    }
    round.value++;
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div class="admin">
      <header class="topbar">
        <strong>{shop.value?.name ?? 'Your shop'}</strong>
        <span class="topbar-note">{mall.value?.name}</span>
        <span class="spacer" />
        <a class="btn small ghost" href={`/?s=${shopId}`} target="_blank" rel="noopener">
          See it in the mall ↗
        </a>
        <button type="button" class="btn small ghost" onClick={signOut}>
          Sign out
        </button>
      </header>
      <main>
        {error.value && <p class="banner error">{error.value}</p>}
        {saved.value && (
          <p class="banner" role="status">
            Saved. Your shop is updated in the mall.
          </p>
        )}
        {!shop.value && !error.value && <p class="hint">Loading…</p>}
        {shop.value && (
          <ShopEditor
            key={round.value}
            shop={shop.value}
            slots={slots.value}
            taken={new Map()}
            owner
            onSaved={async () => {
              saved.value = true;
              await load();
            }}
            onCancel={() => {
              saved.value = false;
              round.value++;
            }}
          />
        )}
      </main>
    </div>
  );
}
