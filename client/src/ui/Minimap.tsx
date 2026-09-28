// Minimap drawn from mall meta: shops in their colours, escalators, and you. North (into the
// mall) is up. Click a shop to travel there, or open floor to walk there. The directory is the
// accessible way to do the same, so the map itself is hidden from screen readers.

import config from 'virtual:plaza-config';
import type { MallMeta, Slot } from '@plaza/shared/meta';
import { useSignal } from '@preact/signals';
import { commands } from '../commands';
import { t } from '../i18n';
import { pose } from '../state';

const PX = 2.6; // pixels per metre
const bySlot = new Map(config.shops.map((s) => [s.slot, s]));

function floorOf(meta: MallMeta, slot: Slot) {
  return meta.floors.findIndex((f) => f.id === slot.floor);
}

function You({ minX, minZ, floor }: { minX: number; minZ: number; floor: number }) {
  const p = pose.value;
  if (p.floor !== floor) return null;
  const x = (p.x - minX) * PX;
  const y = (p.z - minZ) * PX;
  // yaw 0 faces −Z (up on the map); SVG rotation is clockwise, yaw is counter-clockwise
  const deg = (-p.yaw * 180) / Math.PI;
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <circle r="7" fill="rgba(226,184,87,.25)" />
      <path d="M0 -6 L4.5 4.5 L0 2.2 L-4.5 4.5 Z" fill="#e2b857" stroke="#1b1a18" stroke-width="1" />
    </g>
  );
}

export function Minimap({ meta }: { meta: MallMeta }) {
  const viewFloor = useSignal<number | null>(null); // null = follow the player
  const floor = viewFloor.value ?? pose.value.floor;
  const all = meta.slots.map((s) => s.interior);
  const minX = Math.min(...all.map((b) => b.min[0])) - 1;
  const maxX = Math.max(...all.map((b) => b.max[0])) + 1;
  const minZ = Math.min(...all.map((b) => b.min[2])) - 1;
  const maxZ = Math.max(...all.map((b) => b.max[2])) + 5; // room for the entrance
  const w = (maxX - minX) * PX;
  const h = (maxZ - minZ) * PX;
  const rect = (min: number[], max: number[]) => ({
    x: ((min[0] ?? 0) - minX) * PX,
    y: ((min[2] ?? 0) - minZ) * PX,
    width: ((max[0] ?? 0) - (min[0] ?? 0)) * PX,
    height: ((max[2] ?? 0) - (min[2] ?? 0)) * PX,
  });

  // one handler for the whole map: a shop rect travels to that shop, anywhere else walks there
  const onClick = (e: MouseEvent) => {
    const shopId = (e.target as Element).getAttribute('data-shop');
    if (shopId) return commands.travelToShop(shopId);
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = minX + ((e.clientX - r.left) / r.width) * (w / PX);
    const z = minZ + ((e.clientY - r.top) / r.height) * (h / PX);
    commands.walkTo(x, z, floor);
  };

  return (
    <aside class="minimap glass" aria-hidden="true">
      <div class="minimap-head">
        <span class="eyebrow">{t('map.title')}</span>
        {meta.floors.length > 1 && (
          <span class="floor-switch">
            {meta.floors.map((f, i) => (
              <button
                type="button"
                tabIndex={-1}
                key={f.id}
                class={i === floor ? 'on' : ''}
                onClick={() => (viewFloor.value = i === pose.value.floor ? null : i)}
              >
                {i === 0 ? 'G' : i}
              </button>
            ))}
          </span>
        )}
      </div>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: pointer shortcut duplicating the directory; hidden from assistive tech */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same; the directory (/) is the keyboard route */}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} onClick={onClick}>
        <rect x="0" y="0" width={w} height={h} rx="6" fill="rgba(255,255,255,.05)" />
        {meta.slots
          .filter((s) => floorOf(meta, s) === floor)
          .map((slot) => {
            const shop = bySlot.get(slot.id);
            return (
              <rect
                key={slot.id}
                {...rect(slot.interior.min, slot.interior.max)}
                rx="2"
                fill={shop ? shop.colors.bg : 'rgba(255,255,255,.06)'}
                stroke={shop ? shop.colors.accent : 'rgba(255,255,255,.12)'}
                stroke-width="1"
                class={shop ? 'map-shop' : ''}
                data-shop={shop?.id}
              >
                {shop && <title>{shop.name}</title>}
              </rect>
            );
          })}
        {meta.escalators.map((e) => (
          <line
            key={e.id}
            x1={(e.from[0] - minX) * PX}
            y1={(e.from[2] - minZ) * PX}
            x2={(e.to[0] - minX) * PX}
            y2={(e.to[2] - minZ) * PX}
            stroke="rgba(255,255,255,.35)"
            stroke-width="3"
            stroke-dasharray="2 2"
          />
        ))}
        <You minX={minX} minZ={minZ} floor={floor} />
      </svg>
    </aside>
  );
}
