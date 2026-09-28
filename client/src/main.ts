import config from 'virtual:plaza-config';
import { effect } from '@preact/signals';
import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { installCommands } from './commands';
import { startLoop } from './loop';
import { createPlaceholderBody } from './player/body';
import { OrbitCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { PathFollower } from './player/follow';
import { Input } from './player/input';
import { Intro } from './player/intro';
import { Overview } from './player/overview';
import { PathFinder } from './player/path';
import { createTouchControls } from './player/touch';
import { Travel } from './player/travel';
import { WalkTo } from './player/walkto';
import type { DebugOverlay } from './render/debug';
import { createRenderer } from './render/renderer';
import {
  mallMeta,
  nearbyShop,
  openShop,
  overview,
  phase,
  pose,
  profile,
  toast,
  uiHasFocus,
  zone,
} from './state';
import { mountUI } from './ui/App';
import { escalatorCarry } from './world/escalators';
import { loadMall } from './world/mall';
import { buildStorefronts } from './world/storefronts';
import { ZoneTracker } from './world/zones';
import './style.css';

document.title = config.mall.name;
const debugMode = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const { renderer, camera } = createRenderer(canvas);
// the landing screen shows straight away; the world loads behind it
mountUI();

const scene = new Scene();
scene.background = new Color('#12110f');
const fog = new Fog('#12110f', 60, 140);
scene.fog = fog;
scene.add(new HemisphereLight('#fff6e6', '#6b6152', 2.2));
const sun = new DirectionalLight('#fff1dc', 1.6);
sun.position.set(8, 20, 6);
scene.add(sun);

const mall = await loadMall();
scene.add(mall.visual);
const storefronts = await buildStorefronts(mall.meta, config.shops);
scene.add(storefronts.group);
mallMeta.value = mall.meta;

const input = new Input(canvas);
if (matchMedia('(pointer: coarse)').matches) {
  const touch = createTouchControls(canvas, input);
  effect(() => {
    touch.classList.toggle('off', phase.value !== 'playing'); // no joystick over the landing screen
  });
}
const player = new PlayerController(mall.collider);
const spawn = mall.meta.spawns[0] ?? { pos: [0, 0, 0], yaw: 0 };
player.place(spawn.pos[0], spawn.pos[1], spawn.pos[2], spawn.yaw);
const { group: body, setColor } = createPlaceholderBody();
scene.add(body);
effect(() => {
  setColor(profile.value.color);
});

const orbit = new OrbitCamera(mall.collider, spawn.yaw);
const follower = new PathFollower();
const finder = new PathFinder(mall.nav);
const walkTo = new WalkTo(camera, mall.collider, mall.meta, finder, follower);
scene.add(walkTo.marker);
const travel = new Travel(config.shops, mall.meta, player, orbit, finder, follower);
installCommands({
  travelToShop: (id) => travel.toShop(id),
  walkTo: (x, z, floor) => {
    const y = mall.meta.floors[floor]?.y ?? 0;
    if (!walkTo.walkToPoint({ x, y, z }, player)) toast("Can't walk there");
  },
});
let poseAt = 0;

// overview: one global clipping plane, parked far away when unused (so shaders never recompile)
const over = new Overview();
renderer.clippingPlanes = [over.clip];
const inner = mall.meta.slots.map((s) => s.interior);
const bounds = {
  minX: Math.min(...inner.map((b) => b.min[0])),
  maxX: Math.max(...inner.map((b) => b.max[0])),
  minZ: Math.min(...inner.map((b) => b.min[2])),
  maxZ: Math.max(...inner.map((b) => b.max[2])) + 4,
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const still = { x: 0, y: 0 };

// "You are in …": shop zones show the name of the shop assigned to that slot in plaza.config.ts
const shopBySlot = new Map(config.shops.map((s) => [s.slot, s.name]));
const zones = new ZoneTracker(mall.meta.zones);

// landing: a slow dolly down the concourse; on Enter, fly down to the follow camera
const intro = new Intro();
effect(() => {
  if (phase.value !== 'playing' || intro.flying) return;
  intro.begin();
  performance.mark('playable');
});

let debug: DebugOverlay | undefined;
if (debugMode) {
  const [{ createDebugOverlay }, { createGizmos }] = await Promise.all([
    import('./render/debug'),
    import('./world/gizmos'),
  ]);
  debug = createDebugOverlay(renderer);
  scene.add(createGizmos(mall.meta, mall.nav));
  // handle for Playwright tests and console poking; never present without ?debug
  Object.assign(window, { plaza: { scene, camera, renderer, mall, player, input, follower } });
}

startLoop({
  step: (dt) => {
    // while a dialog is open the keyboard belongs to the UI
    const manual = uiHasFocus.value ? still : input.move();
    const jump = !uiHasFocus.value && input.jump();
    // any manual movement or a jump cancels tap-to-walk
    if (manual.x !== 0 || manual.y !== 0 || jump) {
      follower.stop();
      travel.cancel();
    }
    const move = follower.active ? (follower.update(dt, player.pos, orbit.yaw) ?? still) : manual;
    escalatorCarry(mall.meta.escalators, player.pos, player.carry);
    player.step(dt, { x: move.x, y: move.y, run: input.run, jump, yaw: orbit.yaw });
    const near = storefronts.nearby(player.pos)?.id ?? null;
    if (near !== nearbyShop.value) nearbyShop.value = near;
    // arrived after directory travel: open that shop's panel
    const arrived = travel.arrived(near);
    if (arrived) openShop(arrived);
    if (input.keys.consume('KeyM') && !uiHasFocus.value) overview.value = !overview.value;
    const visit = input.keys.consume('KeyE'); // always consume, so a stray press can't fire later
    if (visit && near && !uiHasFocus.value) openShop(near);
    if (zones.update(dt, player.pos) && zones.current) {
      const z = zones.current;
      zone.value = { id: z.id, name: (z.slot && shopBySlot.get(z.slot)) || z.name };
    }
  },
  render: (alpha, dt) => {
    const t0 = performance.now();
    body.position.lerpVectors(player.prev, player.pos, alpha);
    body.rotation.y = player.facing;

    const tap = input.takeTap();
    if (tap && phase.value === 'playing' && !walkTo.tap(tap.x, tap.y, player, canvas, over.clipY))
      toast("Can't walk there");
    walkTo.update(dt);
    // minimap pose at ≤ 10 Hz
    const now = performance.now();
    if (now - poseAt > 100) {
      poseAt = now;
      pose.value = {
        x: player.pos.x,
        z: player.pos.z,
        yaw: player.facing,
        floor: mall.nav.floorAt(player.pos.y + 0.1),
      };
    }
    const moving = player.speed > 0.3;
    orbit.update(dt, body.position, player.facing, moving, input.takeLook(), input.takeZoom());
    over.active = overview.value;
    const floorY = mall.meta.floors[mall.nav.floorAt(player.pos.y + 0.1)]?.y ?? 0;
    over.update(dt, reduceMotion.matches, orbit, bounds, floorY, camera.fov, camera.aspect);
    intro.update(dt, reduceMotion.matches, over);
    const view = intro.done ? over : intro;
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    // the overview camera is ~70 m up: push the fog back so the mall isn't greyed out
    fog.near = 60 + 200 * over.t;
    fog.far = 140 + 200 * over.t;

    renderer.render(scene, camera);
    if (debug) {
      debug.set('pos', `${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(2)} ${player.pos.z.toFixed(1)}`);
      debug.set('ground', player.grounded ? 'yes' : 'no');
      debug.update(performance.now() - t0);
    }
  },
});
