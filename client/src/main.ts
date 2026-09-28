import config from 'virtual:plaza-config';
import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { startLoop } from './loop';
import { createPlaceholderBody } from './player/body';
import { OrbitCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { PathFollower } from './player/follow';
import { Input } from './player/input';
import { PathFinder } from './player/path';
import { createTouchControls } from './player/touch';
import { WalkTo } from './player/walkto';
import type { DebugOverlay } from './render/debug';
import { createRenderer } from './render/renderer';
import { toast, uiHasFocus, zone } from './state';
import { mountUI } from './ui/App';
import { escalatorCarry } from './world/escalators';
import { loadMall } from './world/mall';
import { ZoneTracker } from './world/zones';
import './style.css';

document.title = config.mall.name;
const debugMode = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const { renderer, camera } = createRenderer(canvas);

const scene = new Scene();
scene.background = new Color('#12110f');
scene.fog = new Fog('#12110f', 60, 140);
scene.add(new HemisphereLight('#fff6e6', '#6b6152', 2.2));
const sun = new DirectionalLight('#fff1dc', 1.6);
sun.position.set(8, 20, 6);
scene.add(sun);

const mall = await loadMall();
scene.add(mall.visual);

const input = new Input(canvas);
if (matchMedia('(pointer: coarse)').matches) createTouchControls(canvas, input);
const player = new PlayerController(mall.collider);
const spawn = mall.meta.spawns[0] ?? { pos: [0, 0, 0], yaw: 0 };
player.place(spawn.pos[0], spawn.pos[1], spawn.pos[2], spawn.yaw);
const body = createPlaceholderBody();
scene.add(body);

const orbit = new OrbitCamera(mall.collider, spawn.yaw);
const follower = new PathFollower();
const walkTo = new WalkTo(camera, mall.collider, mall.meta, new PathFinder(mall.nav), follower);
scene.add(walkTo.marker);
const still = { x: 0, y: 0 };

// "You are in …": shop zones show the name of the shop assigned to that slot in plaza.config.ts
const shopBySlot = new Map(config.shops.map((s) => [s.slot, s.name]));
const zones = new ZoneTracker(mall.meta.zones);
mountUI();

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
    if (manual.x !== 0 || manual.y !== 0 || jump) follower.stop();
    const move = follower.active ? (follower.update(dt, player.pos, orbit.yaw) ?? still) : manual;
    escalatorCarry(mall.meta.escalators, player.pos, player.carry);
    player.step(dt, { x: move.x, y: move.y, run: input.run, jump, yaw: orbit.yaw });
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
    if (tap && !walkTo.tap(tap.x, tap.y, player, canvas)) toast("Can't walk there");
    walkTo.update(dt);
    const moving = player.speed > 0.3;
    orbit.update(dt, body.position, player.facing, moving, input.takeLook(), input.takeZoom());
    camera.position.copy(orbit.position);
    camera.lookAt(orbit.target);

    renderer.render(scene, camera);
    if (debug) {
      debug.set('pos', `${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(2)} ${player.pos.z.toFixed(1)}`);
      debug.set('ground', player.grounded ? 'yes' : 'no');
      debug.update(performance.now() - t0);
    }
  },
});
