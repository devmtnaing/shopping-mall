// A plan of a unit seen from above, with the furniture its layout puts inside: the rental form
// shows it for the type of shop chosen, and the admin's shop editor for the category typed in.
// Drawn from the same layouts the mall furnishes units with (world/layouts.ts), so it matches.

import type { Slot } from '@shopping-mall/shared/meta';
import { useEffect, useState } from 'preact/hooks';
import { asset } from '../assets';
import { type Layout, unitItems, unitSize } from '../world/layouts';
import type { PropIndex } from '../world/props';

type Footprints = PropIndex['footprints'];
let footprintsLoad: Promise<Footprints> | null = null;
/** Kept once loaded, so a plan drawn again (after a save) doesn't flash empty. */
let footprintsLoaded: Footprints | null = null;
const loadFootprints = () => {
  footprintsLoad ??= fetch(asset('props/index.json'))
    .then((r) => r.json() as Promise<PropIndex>)
    .then((i) => (footprintsLoaded = i.footprints))
    .catch(() => ({}));
  return footprintsLoad;
};
/** Props without a collision box (chairs, carts) still get a small square on the plan. */
const SMALL: [number, number, number] = [0.55, 0, 0.55];
const PAD = 0.4;

export function InteriorPlan({
  slot,
  layout,
  accent,
  label,
}: {
  slot: Slot;
  layout: Layout;
  accent: string;
  /** What the plan shows, for screen readers. */
  label: string;
}) {
  const [footprints, setFootprints] = useState<Footprints | null>(footprintsLoaded);
  useEffect(() => {
    if (footprintsLoaded) return;
    let live = true;
    loadFootprints().then((f) => live && setFootprints(f));
    return () => {
      live = false;
    };
  }, []);

  const { depth, width } = unitSize(slot);
  const items = unitItems(layout, depth, width);
  const W = width + PAD * 2;
  const H = depth + PAD * 2;
  // door at the bottom, so walking in is walking up the page; x+ is to your right
  const sx = (x: number) => x + W / 2;
  const sy = (d: number) => PAD + depth - d;
  const door = Math.min(3, width * 0.4);

  return (
    <svg class="plan" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <rect
        x={PAD}
        y={PAD}
        width={width}
        height={depth}
        rx={0.15}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.35)"
        stroke-width={0.08}
      />
      {/* the shopfront: open where the door is */}
      <line
        x1={sx(-door / 2)}
        x2={sx(door / 2)}
        y1={PAD + depth}
        y2={PAD + depth}
        stroke={accent}
        stroke-width={0.22}
        stroke-linecap="round"
      />
      {footprints &&
        items.map((it, i) => {
          const [w, , d] = footprints[it.kind] ?? SMALL;
          // quarter turns only: sideways pieces swap width and depth (as their collision boxes do)
          const [hx, hd] = Math.abs(Math.sin(it.yaw)) > 0.5 ? [d / 2, w / 2] : [w / 2, d / 2];
          const till = it.kind === 'register' || it.kind === 'coffee-bar';
          return (
            <rect
              key={i}
              x={sx(it.x - hx)}
              y={sy(it.d + hd)}
              width={hx * 2}
              height={hd * 2}
              rx={0.08}
              fill={accent}
              fill-opacity={till ? 0.9 : 0.4}
              stroke={accent}
              stroke-width={0.05}
            />
          );
        })}
    </svg>
  );
}
