// Always-on overlay: brand pill (top left), zone label (top centre), share / language / fullscreen (top right).

import { content } from '../content';
import { locales, nextLocale, setLocale, t, zoneName } from '../i18n';
import { linkUrl } from '../links';
import { netStatus, pose, roomCount, zone } from '../state';
import { IconExpand, IconGlobe, IconShare } from './icons';
import { share } from './share';

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function BrandPill() {
  return (
    <div class="brand glass">
      <span class="brand-mark">{initials(content.value.mall.name)}</span>
      <span class="brand-name">{content.value.mall.name}</span>
      {netStatus.value === 'online' && (
        <span class="brand-online">
          <i aria-hidden="true" />
          {t('net.online', { n: String(roomCount.value) })}
        </span>
      )}
    </div>
  );
}

export function ZoneLabel() {
  const z = zone.value;
  if (!z) return null;
  // keyed by id so the fade-in replays on every change
  return (
    <div class="zone glass" key={z.id} aria-live="polite">
      <div class="eyebrow">{t('hud.youAreIn')}</div>
      <div class="zone-name">{z.area ? zoneName(z.area, z.name) : z.name}</div>
    </div>
  );
}

/** Shown only when the connection is trouble: reconnecting, or offline (solo). */
export function NetNotice() {
  const s = netStatus.value;
  if (s !== 'reconnecting' && s !== 'offline') return null;
  return (
    <div class="net-notice glass" role="status">
      {t(s === 'offline' ? 'net.offline' : 'net.reconnecting')}
    </div>
  );
}

export function TopRight({ playing }: { playing: boolean }) {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  const shareSpot = () => share(linkUrl({ kind: 'at', ...pose.value }), content.value.mall.name);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <div class="top-right">
      {playing && (
        <button type="button" class="icon-btn glass" aria-label={t('hud.shareSpot')} onClick={shareSpot}>
          <IconShare />
        </button>
      )}
      {locales.length > 1 && (
        <button
          type="button"
          class="icon-btn glass"
          aria-label={`${t('language')}: ${nextLocale().toUpperCase()}`}
          onClick={() => setLocale(nextLocale())}
        >
          <IconGlobe />
        </button>
      )}
      {canFullscreen && (
        <button type="button" class="icon-btn glass" aria-label={t('hud.fullscreen')} onClick={toggle}>
          <IconExpand />
        </button>
      )}
    </div>
  );
}
