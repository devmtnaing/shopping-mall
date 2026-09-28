// Always-on overlay: brand pill (top left), zone label (top centre), fullscreen (top right).
import config from 'virtual:plaza-config';
import { linkUrl } from '../links';
import { pose, zone } from '../state';
import { IconExpand, IconShare } from './icons';
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
      <span class="brand-mark">{initials(config.mall.name)}</span>
      <span class="brand-name">{config.mall.name}</span>
    </div>
  );
}

export function ZoneLabel() {
  const z = zone.value;
  if (!z) return null;
  // keyed by id so the fade-in replays on every change
  return (
    <div class="zone glass" key={z.id} aria-live="polite">
      <div class="eyebrow">You are in</div>
      <div class="zone-name">{z.name}</div>
    </div>
  );
}

export function TopRight({ playing }: { playing: boolean }) {
  const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
  const shareSpot = () => {
    const p = pose.value;
    share(linkUrl({ kind: 'at', ...p }), `Meet me in ${config.mall.name}`);
  };
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <div class="top-right">
      {playing && (
        <button type="button" class="icon-btn glass" aria-label="Share where you are" onClick={shareSpot}>
          <IconShare />
        </button>
      )}
      {canFullscreen && (
        <button type="button" class="icon-btn glass" aria-label="Full screen" onClick={toggle}>
          <IconExpand />
        </button>
      )}
    </div>
  );
}
