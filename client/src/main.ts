import { effect } from '@preact/signals';
import { THROW_RELEASE } from '@shopping-mall/shared/avatars';
import { PLAYER } from '@shopping-mall/shared/constants';
import { APPLE, EMOTES } from '@shopping-mall/shared/protocol';
import { Color, DirectionalLight, Fog, HemisphereLight, Ray, Scene, Vector3 } from 'three';
import { track } from './analytics';
import { type Sound, soundOnFirstInteraction, toggleSound } from './audio';
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
import { castRay } from './player/raycast';
import { nearestSpot, type SeatSpot, seatSpots, standSpot } from './player/seats';
import { createTouchControls } from './player/touch';
import { Travel } from './player/travel';
import { WalkTo } from './player/walkto';
import { AutoQuality, TIERS, tier } from './quality';
import type { DebugOverlay } from './render/debug';
import { installEnvironment } from './render/environment';
import { createRenderer } from './render/renderer';
import { DynamicResolution } from './render/resolution';
import {
  applePrompt,
  mallMeta,
  nearbyShop,
  openShop,
  overview,
  panel,
  phase,
  pose,
  profile,
  seatPrompt,
  toast,
  uiHasFocus,
  viewFloor,
  zone,
} from './state';
import { mountUI } from './ui/App';
import { Apples, handApple, standWithin } from './world/apples';
import { escalatorCarry, escalatorSteps } from './world/escalators';
import { type FountainWater, fountainWater } from './world/fountain';
import { loadMall } from './world/mall';
import { Shoppers } from './world/shoppers';
import { installSky } from './world/sky';
import { buildStorefronts } from './world/storefronts';
import { ZoneTracker } from './world/zones';
import './style.css';

effect(() => {
  document.title = content.value.mall.name;
});
const params = new URLSearchParams(location.search);
const debugMode = params.has('debug');
/** ?perf: the test handle below, without the overlay and gizmos (they'd skew draw calls). */
const perfMode = params.has('perf');

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
const steps = escalatorSteps(mall.meta.escalators);
scene.add(steps.group);
const sky = installSky(mall.visual); // drifting clouds in the skylight
// High only: the floor mirrors the mall. Loaded after the start (three's Reflector isn't small).
let mirror: { update(show: boolean): void } | null = null;
import('./render/mirror')
  .then(({ installFloorMirror }) => {
    mirror = installFloorMirror(renderer, scene);
  })
  .catch((e) => console.warn('mirror:', e));
const vacant = () => ({ title: t('sign.comingSoon'), subtitle: t('sign.available') });
let storefronts = await buildStorefronts(mall.meta, content.value.shops, vacant());
// repaint the "Coming soon" signs when the language changes
locale.subscribe(() => storefronts.setVacantText(t('sign.comingSoon'), t('sign.available')));
scene.add(storefronts.group);
mallMeta.value = mall.meta;
// benches, plants, lamps…: after the mall, never blocking it, and far-off packs as you approach
const start = mall.meta.spawns[0]?.pos ?? [0, 0, 0];
const propsLib = import('./world/props').then(async (m) => ({ ...m, lib: await m.PropLibrary.load() }));
let props: import('./world/props').PropLayer | null = null;
let water: FountainWater | null = null;
propsLib
  .then(async ({ lib, propLayer }) => {
    props = propLayer(lib, mall.meta.props ?? [], new Vector3(...start));
    scene.add(props.group);
    // moving water, once the fountain itself is in
    void props.whenLoaded('fountain').then(() => {
      water = fountainWater(mall.meta.props ?? []);
      scene.add(water.group);
    });
    await props.near;
    // reflections: capture the mall once it's furnished, from eye height in the middle of the hall
    installEnvironment(renderer, scene, new Vector3(start[0], start[1] + 2, start[2] - 20));
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
// apples (T-507): one at a time. At a fruit stand, F picks one (you turn to it, reach, and it shows in
// your hand, then turn back); with one in hand, F throws it straight ahead. You stand still for the
// reach and the wind-up, so the animation always plays.
const apples = new Apples(mall.collider);
scene.add(apples.group);
const stands = (mall.meta.props ?? []).filter((p) => p.kind === 'fruit').map((p) => p.pos);
let holding = false;
/** The apple appears in the hand part-way through the reach. */
const PICK_AT = 0.3;
let picking = 0;
/** The way you faced before turning to the stand, to turn back to once you have the apple. */
let facedBefore = 0;
/** A turn in progress (to the stand and back): eased like a walking turn, not snapped. */
let turnTo: number | null = null;
const atStand = () => (holding || picking > 0 ? null : standWithin(stands, player.pos));
function apple() {
  if (picking > 0 || throwing > 0) return;
  const stand = atStand();
  if (stand) {
    facedBefore = player.facing;
    turnTo = Math.atan2(-((stand[0] ?? 0) - player.pos.x), -((stand[2] ?? 0) - player.pos.z));
    avatar?.gesture('interact-right', 0, true);
    picking = PICK_AT;
    return;
  }
  if (!holding) return;
  // straight ahead, the way you face; the apple leaves the hand at the release (release())
  turnTo = null;
  throwYaw = player.facing;
  avatar?.gesture('throw', 0, true);
  throwing = THROW_RELEASE;
}
/** Seconds until the apple leaves the hand, while throwing, and which way it goes. */
let throwing = 0;
let throwYaw = 0;
const hand = new Vector3();
function release() {
  holding = false;
  const dx = -Math.sin(throwYaw);
  const dz = -Math.cos(throwYaw);
  // from the hand (up and forward at the release), or about there before the character has loaded
  const at = avatar?.handPosition(hand);
  const o: [number, number, number] = at
    ? [at.x, Math.max(at.y, player.pos.y + 0.8), at.z]
    : [player.pos.x + dx * 0.35, player.pos.y + 1.25, player.pos.z + dz * 0.35];
  avatar?.hold(null);
  const v: [number, number, number] = [dx * APPLE.speed, APPLE.lift, dz * APPLE.speed];
  apples.throw(o, v);
  multi.throwApple(o, v);
}

// benches: sit with E, stand up by moving
const spots = seatSpots(mall.meta);
let seated: SeatSpot | null = null;
function toggleSeat() {
  if (seated) {
    const up = standSpot(seated);
    seated = null;
    player.place(up.x, up.y + 0.05, up.z, up.yaw);
    return;
  }
  const spot = nearestSpot(spots, player.pos);
  if (!spot) return;
  follower.stop();
  travel.cancel();
  seated = spot;
  avatar?.sitOn(spot.seat);
  player.place(spot.x, spot.y, spot.z, spot.yaw);
}
const travel = new Travel(() => content.value.shops, mall.meta, player, orbit, finder, follower);

// multiplayer: connects once the visitor enters; without a server the mall stays single-player
const multi = createMultiplayer({
  scene,
  player,
  travel,
  floorAt: (y) => mall.nav.floorAt(y),
  onSelfEmote: (e) => avatar?.emote(e),
  seated: () => seated !== null,
  seats: spots,
  // someone hugged you: turn to face them, if you're standing still
  onThrow: (o, v) => apples.throw(o, v),
  onHugFrom: (x, z) => {
    if (seated || player.speed > 0.2) return;
    player.facing = Math.atan2(-(x - player.pos.x), -(z - player.pos.z));
  },
});
// a new character or colour mid-visit (dock → Character): tell the room
let sentLook = `${profile.value.color} ${profile.value.avatar}`;
effect(() => {
  const { color, avatar } = profile.value;
  const look = `${color} ${avatar}`;
  if (look === sentLook) return;
  sentLook = look;
  multi.setLook({ color, avatar });
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
      if (holding) avatar.hold(handApple());
      if (seated) avatar.sitOn(seated.seat);
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
  toggleSeat,
  apple,
  walkTo: (x, z, floor) => {
    const y = mall.meta.floors[floor]?.y ?? 0;
    if (!walkTo.walkToPoint({ x, y, z }, player)) toast(t('toast.cantWalk'));
  },
});
let poseAt = 0;

// the overview opens on your floor (its floor switch, or the minimap's, shows the other)
effect(() => {
  if (overview.value) viewFloor.value = null;
});
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
track({ e: 'visit', locale: locale.value, tier: tier.value, touch: matchMedia('(pointer: coarse)').matches });

// sound starts on the first click, tap or key press (nothing loads before)
let sound: Sound | null = null;
const fountainAt = mall.meta.props?.find((p) => p.kind === 'fountain')?.pos;
soundOnFirstInteraction(fountainAt ? { x: fountainAt[0], y: fountainAt[1], z: fountainAt[2] } : null, (s) => {
  sound = s;
});
effect(() => {
  if (panel.value) sound?.chime(); // a shop's door opens
});
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('#ui button')) sound?.tap();
});
const ears = new Vector3();
const dynamicRes = new DynamicResolution();
effect(() => dynamicRes.setBudget(tier.value === 'low' ? 1000 / 30 : 1000 / 60));
/** Last time anything moved or was touched (for the idle frame rate). */
let activeAt = performance.now();
/** Nothing for this long, and the mall drops to 30 fps. */
const IDLE_AFTER = 10_000;

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

// shop interiors, furnished by category (and solid), rebuilt whenever the shops change
let interiors: import('./world/props').PropLayer | null = null;
let furnishSeq = 0;
const furnishShops = (shops: typeof content.value.shops) => {
  const seq = ++furnishSeq;
  void Promise.all([propsLib, import('./world/interiors')])
    .then(([{ lib, propLayer }, { furnish }]) => {
      if (seq !== furnishSeq) return;
      // furniture stands on the floor under it (a flagship's showcase is on its stage)
      const down = new Ray(new Vector3(), new Vector3(0, -1, 0));
      const floorAt = (x: number, z: number, above: number) => {
        down.origin.set(x, above + 2.5, z);
        return castRay(mall.collider, down, 3.5)?.point.y ?? above;
      };
      const { placements, obstacles } = furnish(mall.meta, shops, lib.index.footprints, floorAt);
      interiors?.dispose();
      interiors = propLayer(lib, placements, player.pos);
      scene.add(interiors.group);
      player.obstacles = obstacles;
    })
    .catch((e) => console.warn('interiors:', e));
};

// live content: when shops change, rebuild the storefronts (signs, strips, floors) in place
let buildSeq = 0;
effect(() => {
  const shops = content.value.shops;
  furnishShops(shops);
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
  track({ e: 'enter', ms: Math.round(performance.now()) });
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
}
if (debugMode || perfMode) {
  // handle for Playwright tests and console poking; never present without ?debug or ?perf
  Object.assign(window, {
    mallDebug: {
      scene,
      camera,
      renderer,
      mall,
      player,
      input,
      follower,
      avatar: () => avatar,
      multi,
      shoppers: () => shoppers,
    },
  });
}

startLoop({
  idle: () => performance.now() - activeAt > IDLE_AFTER && !multi.anyoneMoving(),
  step: (dt) => {
    // while a dialog is open the keyboard belongs to the UI; picking or winding up holds you still
    const manual = uiHasFocus.value || picking > 0 || throwing > 0 ? still : input.move();
    const jump = !uiHasFocus.value && input.jump();
    // any manual movement or a jump cancels tap-to-walk
    if (manual.x !== 0 || manual.y !== 0 || jump) {
      follower.stop();
      travel.cancel();
    }
    const move = follower.active ? (follower.update(dt, player.pos, orbit.yaw) ?? still) : manual;
    // sitting: moving or jumping stands you up; otherwise the body stays put
    if (seated && (move.x !== 0 || move.y !== 0 || jump)) toggleSeat();
    if (!seated) {
      escalatorCarry(mall.meta.escalators, player.pos, player.carry);
      player.step(dt, { x: move.x, y: move.y, run: input.run, jump, yaw: orbit.yaw });
    }
    // a turn in progress (to a fruit stand and back), eased like a walking turn
    if (turnTo !== null) {
      const d = Math.atan2(Math.sin(turnTo - player.facing), Math.cos(turnTo - player.facing));
      if (move.x !== 0 || move.y !== 0 || Math.abs(d) < 0.01)
        turnTo = null; // walking off: the controller steers
      else player.facing += d * (1 - Math.exp(-PLAYER.turnRate * dt));
    }
    const near = storefronts.nearby(player.pos)?.id ?? null;
    if (near !== nearbyShop.value) nearbyShop.value = near;
    // arrived after directory travel: open that shop's panel
    const arrived = intro.done ? travel.arrived(near) : null;
    if (arrived) openShop(arrived);
    if (input.keys.consume('KeyM') && !uiHasFocus.value) overview.value = !overview.value;
    if (input.keys.consume('KeyN') && !uiHasFocus.value) toggleSound();
    multi.step();
    for (let i = 0; i < EMOTES.length; i++) {
      if (input.keys.consume(`Digit${i + 1}`) && !uiHasFocus.value) multi.emote(EMOTES[i] as string);
    }
    if (input.keys.consume('KeyF') && !uiHasFocus.value) apple();
    if (picking > 0) {
      picking -= dt;
      if (picking <= 0) {
        holding = true;
        avatar?.hold(handApple());
        turnTo = facedBefore; // and turn back the way you were facing
      }
    }
    if (throwing > 0) {
      throwing -= dt;
      if (throwing <= 0) release();
    }
    const pick = atStand() ? 'pick' : holding && throwing <= 0 ? 'throw' : null;
    if (pick !== (applePrompt.value?.mode ?? null)) applePrompt.value = pick ? { mode: pick } : null;
    const visit = input.keys.consume('KeyE'); // always consume, so a stray press can't fire later
    const seat = seated ? 'stand' : !near && nearestSpot(spots, player.pos) ? 'sit' : null;
    if (seat !== seatPrompt.value) seatPrompt.value = seat;
    if (visit && !uiHasFocus.value) {
      if (near && !seated) openShop(near);
      else if (seat) toggleSeat();
    }
    if (zones.update(dt, player.pos)) showZone();
    props?.update(player.pos);
    interiors?.update(player.pos);
  },
  render: (alpha, dt) => {
    const t0 = performance.now();
    if (phase.value === 'playing' && intro.done) {
      autoQuality.frame(dt * 1000);
      dynamicRes.frame(dt * 1000);
    }
    body.position.lerpVectors(player.prev, player.pos, alpha);
    body.rotation.y = player.facing;
    if (avatar) {
      avatar.setState(animState(player, seated !== null), player.speed);
      avatar.update(dt);
    }
    shoppers?.update(dt, camera.position);
    apples.update(dt);
    sky.update(dt);
    mirror?.update(over.t === 0); // from above it would only mirror the sky
    water?.update(dt);
    steps.update(dt);

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
    const look = input.takeLook();
    const zoom = input.takeZoom();
    if (
      moving ||
      look.yaw !== 0 ||
      look.pitch !== 0 ||
      zoom !== 0 ||
      !player.grounded ||
      !intro.done ||
      over.t > 0
    )
      activeAt = now;
    orbit.update(dt, body.position, player.facing, moving, look, zoom);
    over.active = overview.value;
    const shown = (over.active ? viewFloor.value : null) ?? mall.nav.floorAt(player.pos.y + 0.1);
    const floorY = mall.meta.floors[shown]?.y ?? 0;
    over.update(dt, reduceMotion.matches, orbit, bounds, floorY, camera.fov, camera.aspect);
    intro.update(dt, reduceMotion.matches, over);
    const view = intro.done ? over : intro;
    camera.position.copy(view.position);
    camera.lookAt(view.target);
    // the overview camera is ~70 m up: push the fog back so the mall isn't greyed out
    fog.near = 60 + 200 * over.t;
    fog.far = 140 + 200 * over.t;

    multi.render(now, camera, body.position, canvas.clientWidth, canvas.clientHeight);
    sound?.listen(camera.position, camera.getWorldDirection(ears));
    renderer.render(scene, camera);
    if (debug) {
      debug.set('pos', `${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(2)} ${player.pos.z.toFixed(1)}`);
      debug.set('ground', player.grounded ? 'yes' : 'no');
      debug.update(performance.now() - t0);
    }
  },
});
