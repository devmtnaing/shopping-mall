// "Where do you want to go?": searchable list of shops. Picking one travels there.

import config from 'virtual:mall-config';
import type { Shop } from '@shopping-mall/shared/config';
import { useMemo, useRef, useState } from 'preact/hooks';
import { commands } from '../commands';
import { t } from '../i18n';
import { searchShops } from '../shops/search';
import { dialog } from '../state';
import { Dialog } from './Dialog';

/** "Ground floor", "Upper floor"… from the slot id convention (u- prefix = upstairs). */
function where(shop: Shop) {
  if (shop.slot === 'flagship') return t('where.flagship');
  const floor = shop.slot.startsWith('u-') ? t('where.upper') : t('where.ground');
  const side = shop.slot.replace('u-', '').startsWith('w') ? t('where.left') : t('where.right');
  return `${floor} · ${side}`;
}

export function Directory() {
  const [query, setQuery] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchShops(config.shops, query), [query]);
  const close = () => (dialog.value = null);
  const go = (id: string) => {
    close();
    commands.travelToShop(id);
  };

  // group by category only when browsing; search results stay in ranked order
  const groups = useMemo(() => {
    if (query.trim()) return [{ name: '', shops: results }];
    const map = new Map<string, Shop[]>();
    for (const s of results) {
      const key = s.category ?? t('dir.shops');
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map].map(([name, shops]) => ({ name, shops }));
  }, [results, query]);

  const move = (e: KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') items[Math.min(items.length - 1, i + 1)]?.focus();
    else if (e.key === 'ArrowUp')
      (i <= 0 ? (e.currentTarget as HTMLElement).querySelector('input') : items[i - 1])?.focus();
    else return;
    e.preventDefault();
  };

  return (
    <Dialog title={t('dir.title')} eyebrow={t('dir.eyebrow')} onClose={close}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow-key navigation between the search box and results */}
      <div class="directory" onKeyDown={move}>
        <input
          class="search"
          type="search"
          placeholder={t('dir.search')}
          aria-label={t('dir.search')}
          autoFocus
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0].id);
          }}
        />
        <ul ref={list} class="dir-list">
          {groups.map((g) => (
            <li key={g.name}>
              {g.name && <div class="section-title">{g.name}</div>}
              <ul>
                {g.shops.map((s) => (
                  <li key={s.id}>
                    <button type="button" class="dir-item" onClick={() => go(s.id)}>
                      <span class="swatch" style={{ background: s.colors.bg, color: s.colors.accent }}>
                        {s.name.slice(0, 1)}
                      </span>
                      <span class="dir-text">
                        <span class="dir-name">{s.name}</span>
                        <span class="dir-sub">{s.tagline ?? where(s)}</span>
                      </span>
                      <span class="dir-where">{where(s)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {results.length === 0 && <p class="note">{t('dir.none', { q: query })}</p>}
      </div>
    </Dialog>
  );
}
