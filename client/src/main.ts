import { effect } from '@preact/signals';
import { EMOTES } from '@shopping-mall/shared/protocol';
import { Color, DirectionalLight, Fog, HemisphereLight, Scene, Vector3 } from 'three';
import type { Avatar } from './avatars/kit';
import { installCommands } from './commands';
import { art, content, loadContent } from './content';
import { locale, t } from './i18n';
import type { Key } from './i18n/en';
import { parseLink } from './links';
import { startLoop } from './loop';
import { createMultiplayer } from './net/multiplayer';
import { animState } from './player/anim';
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
import { AutoQuality, TIERS } from './quality';
import type { DebugOverlay } from './render/debug';
import { installEnvironment } from './render/environment';
import { createRenderer } from './render/renderer';
import {
  mallMeta,
  nearbyShop,
  openShop,
  overview,
  panel,
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
import { Shoppers } from './world/shoppers';
import { buildStorefronts } from './world/storefronts';
import { ZoneTracker } from './world/zones';
import './style.css';

effect(() => {
  document.title = content.value.mall.name;
});
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

// the mall model and the latest content (from the server, when there is one) load together
// content first: it says which building to load (a host may have uploaded their own)
await loadContent();
const mall = await loadMall(art ?? undefined);
scene.add(mall.visual);
const vacant = () => ({ title: t('sign.comingSoon'), subtitle: t('sign.available') });
let storefronts = await buildStorefronts(mall.meta, content.value.shops, vacant());
// repaint the "Coming soon" signs when the language changes
locale.subscribe(() => storefronts.setVacantText(t('sign.comingSoon'), t('sign.available')));
scene.add(storefronts.group);
mallMeta.value = mall.meta;
// benches, plants, lamps…: after the mall, never blocking it
import('./world/props')
  .then(({ loadProps }) => loadProps(mall.meta))
  .then((props) => {
    scene.add(props);
    // reflections: capture the mall once it's furnished, from eye height in the middle of the hall
    const spawn = mall.meta.spawns[0]?.pos ?? [0, 0, 0];
    installEnvironment(renderer, scene, new Vector3(spawn[0], spawn[1] + 2, spawn[2] - 20));
  })
  .catch((e) => console.warn('props:', e));

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
const { group: body, setColor, setPlaceholder } = createPlaceholderBody();
scene.add(body);
effect(() => {
  setColor(profile.value.color);
});
let avatar: Avatar | null = null;
let shoppers: Shoppers | null = null;

const orbit = new OrbitCamera(mall.collider, spawn.yaw);
const follower = new PathFollower();
const finder = new PathFinder(mall.nav);
const walkTo = new WalkTo(camera, mall.collider, mall.meta, finder, follower);
scene.add(walkTo.marker);
const travel = new Travel(() => content.value.shops, mall.meta, player, orbit, finder, follower);

// multiplayer: connects once the visitor enters; without a server the mall stays single-player
const multi = createMultiplayer({
  scene,
  player,
  travel,
  floorAt: (y) => mall.nav.floorAt(y),
  onSelfEmote: (e) => avatar?.emote(e),
});
// avatars load after the world (capsules until then); a failure just keeps the capsules
import('./avatars/kit')
  .then(({ loadAvatarKit }) => loadAvatarKit())
  .then((kit) => {
    multi.setAvatarKit(kit);
    shoppers = new Shoppers(kit, mall.meta, finder, TIERS.high.shoppers);
    scene.add(shoppers.group);
    effect(() => {
      const id = profile.value.avatar;
      if (avatar?.id === id) return;
      avatar?.dispose();
      avatar = kit.create(id);
      body.add(avatar.object);
      setPlaceholder(false);
    });
  })
  .catch((e) => console.warn('avatars:', e));
installCommands({
  travelToShop: (id) => travel.toShop(id),
  sendChat: (text) => multi.sendChat(text),
  emote: (e) => multi.emote(e),
  report: (id) => multi.report(id),
  walkTo: (x, z, floor) => {
    const y = mall.meta.floors[floor]?.y ?? 0;
    if (!walkTo.walkToPoint({ x, y, z }, player)) toast(t('toast.cantWalk'));
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
const autoQuality = new AutoQuality();

// shared links: start at a shop (its panel opens after the fly-in) or at an exact spot
const link = parseLink(location.search);
let linkProblem: Key | null = null;
if (link?.kind === 'shop' && !travel.placeAt(link.id)) linkProblem = 'toast.noShop';
if (link?.kind === 'at') {
  const y = mall.meta.floors[link.floor]?.y;
  const inside = link.x > bounds.minX && link.x < bounds.maxX && link.z > bounds.minZ && link.z < bounds.maxZ;
  if (y === undefined || !inside) linkProblem = 'toast.noSpot';
  else {
    player.place(link.x, y + 0.05, link.z, link.yaw);
    orbit.yaw = link.yaw;
  }
}
const still = { x: 0, y: 0 };

// "You are in …": shop zones show the name of the shop currently assigned to that slot
const zones = new ZoneTracker(mall.meta.zones);
function showZone() {
  const z = zones.current;
  if (!z) return;
  const shopName = z.slot ? content.value.shops.find((s) => s.slot === z.slot)?.name : undefined;
  zone.value = shopName
    ? { id: z.id, name: shopName, area: null }
    : { id: z.id, name: z.name, area: z.slot ? 'vacant' : z.id };
}

// live content: when shops change, rebuild the storefronts (signs, strips, floors) in place
let buildSeq = 0;
effect(() => {
  const shops = content.value.shops;
  const seq = ++buildSeq;
  if (seq === 1) return; // the first build happened above
  void buildStorefronts(mall.meta, shops, vacant()).then((next) => {
    if (seq !== buildSeq) return next.dispose(); // a newer change already superseded this one
    scene.remove(storefronts.group);
    storefronts.dispose();
    storefronts = next;
    scene.add(next.group);
  });
  // a shop that no longer exists can't keep its panel open
  if (panel.value && !shops.some((s) => s.id === panel.value)) panel.value = null;
  showZone();
});

// landing: a slow dolly down the concourse; on Enter, fly down to the follow camera
const intro = new Intro();
effect(() => {
  if (phase.value !== 'playing' || intro.flying) return;
  intro.begin();
  performance.mark('playable');
  if (linkProblem) toast(t(linkProblem), 4000);
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
  Object.assign(window, { mallDebug: { scene, camera, renderer, mall, player, input, follower } });
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
    const arrived = intro.done ? travel.arrived(near) : null;
    if (arrived) openShop(arrived);
    if (input.keys.consume('KeyM') && !uiHasFocus.value) overview.value = !overview.value;
    multi.step();
    for (let i = 0; i < EMOTES.length; i++) {
      if (input.keys.consume(`Digit${i + 1}`) && !uiHasFocus.value) multi.emote(EMOTES[i] as string);
    }
    const visit = input.keys.consume('KeyE'); // always consume, so a stray press can't fire later
    if (visit && near && !uiHasFocus.value) openShop(near);
    if (zones.update(dt, player.pos)) showZone();
  },
  render: (alpha, dt) => {
    const t0 = performance.now();
    if (phase.value === 'playing' && intro.done) autoQuality.frame(dt * 1000);
    body.position.lerpVectors(player.prev, player.pos, alpha);
    body.rotation.y = player.facing;
    if (avatar) {
      avatar.setState(animState(player), player.speed);
      avatar.update(dt);
    }
    shoppers?.update(dt, camera.position);

    const tap = input.takeTap();
    if (tap && phase.value === 'playing' && !walkTo.tap(tap.x, tap.y, player, canvas, over.clipY))
      toast(t('toast.cantWalk'));
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

    multi.render(now, camera, body.position, canvas.clientWidth, canvas.clientHeight);
    renderer.render(scene, camera);
    if (debug) {
      debug.set('pos', `${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(2)} ${player.pos.z.toFixed(1)}`);
      debug.set('ground', player.grounded ? 'yes' : 'no');
      debug.update(performance.now() - t0);
    }
  },
});
