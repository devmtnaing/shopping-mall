// Multiplayer wiring: the server connection, everyone else's avatars, sending your movement,
// and the room state the UI shows. Without a server this all quietly does nothing.

import { effect } from '@preact/signals';
import { THROW_RELEASE } from '@shopping-mall/shared/avatars';
import { animSpeed, FLAG_GROUNDED, packAnim } from '@shopping-mall/shared/protocol';
import type { Camera, Scene } from 'three';
import { Vector3 } from 'three';
import type { AvatarKit } from '../avatars/kit';
import { loadContent, onContentVersion } from '../content';
import { t } from '../i18n';
import { animState } from '../player/anim';
import type { PlayerController } from '../player/controller';
import type { Travel } from '../player/travel';
import { Bubbles } from '../render/bubbles';
import { Crowd } from '../render/crowd';
import {
  addChat,
  announcement,
  hostToken,
  muted,
  netStatus,
  others,
  phase,
  profile,
  roomCount,
  toast,
} from '../state';
import { Remotes } from './remotes';
import { NetClient, serverUrl } from './socket';

const HUG = '🤗';
/** How close (m) someone must be for a hug to turn you both to face each other. */
const HUG_RANGE = 1.8;

export function createMultiplayer(opts: {
  scene: Scene;
  player: PlayerController;
  travel: Travel;
  /** Floor index for a height (for minimap dots). */
  floorAt: (y: number) => number;
  /** Your own emote went out (play its gesture on your avatar). */
  onSelfEmote: (e: string) => void;
  /** Whether you're sitting on a bench (others see you sit). */
  seated: () => boolean;
  /** Someone within hugging range hugged you (turn to face them). */
  onHugFrom?: (x: number, z: number) => void;
  /** Someone threw an apple (fly it here too). */
  onThrow?: (o: [number, number, number], v: [number, number, number]) => void;
}) {
  const { scene, player, travel, floorAt, onSelfEmote, seated, onHugFrom, onThrow } = opts;
  const room = new URLSearchParams(location.search).get('room') ?? 'main';
  const remotes = new Remotes();
  const crowd = new Crowd();
  scene.add(crowd.group);
  const bubbles = new Bubbles();

  const net = new NetClient(serverUrl(room), {
    status: (s) => {
      netStatus.value = s;
    },
    message: (m) => {
      if ((m.t === 'chat' || m.t === 'emote') && muted.value.has(m.id)) return;
      if (m.t === 'chat') {
        bubbles.show(m.id === net.selfId ? 'me' : m.id, m.text);
        const from = m.id === net.selfId ? undefined : m.id;
        return addChat({ kind: 'msg', from, name: m.name, text: m.text, host: m.host });
      }
      if (m.t === 'emote') {
        if (m.id === net.selfId) onSelfEmote(m.e);
        else crowd.emote(m.id, m.e);
        const from = remotes.players.get(m.id);
        if (m.e === HUG && from?.visible && near(from.pose.x, from.pose.z, HUG_RANGE))
          onHugFrom?.(from.pose.x, from.pose.z);
        return bubbles.show(m.id === net.selfId ? 'me' : m.id, m.e, true);
      }
      if (m.t === 'look') return remotes.look(m.id, m.look);
      if (m.t === 'throw') {
        if (m.id === net.selfId || muted.value.has(m.id)) return; // yours is already in the air
        // their apple is already on its way: swing their arm through from the moment it left the hand
        crowd.gesture(m.id, 'throw', THROW_RELEASE);
        return onThrow?.(m.o, m.v);
      }
      if (m.t === 'error' && m.code === 'rate') return toast(t('chat.slowDown'));
      if (m.t === 'error' && m.code === 'bad-token') {
        hostToken.value = null; // expired: carry on as a regular visitor
        toast(m.message);
        net.disconnect();
        return connect();
      }
      if (m.t === 'announce') {
        announcement.value = { text: m.text, key: Date.now() };
        return addChat({ kind: 'sys', text: `📣 ${m.text}` });
      }
      if (m.t === 'content') return onContentVersion(m.version);
      if (m.t === 'welcome') {
        remotes.welcome(m.id, m.players);
        void loadContent(); // catch up on anything that changed while we were away
      } else if (m.t === 'presence') {
        const leaving = m.left.map((id) => remotes.players.get(id)?.info.name ?? '');
        announce(
          m.joined.map((p) => p.name),
          leaving,
        );
        remotes.presence(m.joined, m.left);
      } else return;
      roomCount.value = remotes.players.size + 1;
    },
    snapshotStart: (tick) => remotes.beginSnapshot(tick, performance.now()),
    snapshot: (id, pose) => remotes.snapshot(id, pose, performance.now()),
  });

  travel.onTeleport = () => net.send({ t: 'teleport' });

  /** One quiet line per batch: "Bo joined", or "5 people joined" when it's busy. */
  function announce(joined: string[], left: string[]) {
    const line = (
      names: string[],
      one: 'chat.joined' | 'chat.left',
      many: 'chat.joinedMany' | 'chat.leftMany',
    ) => {
      const named = names.filter(Boolean);
      if (named.length === 0) return;
      const text =
        named.length === 1 ? t(one, { name: named[0] as string }) : t(many, { n: String(named.length) });
      addChat({ kind: 'sys', text });
    };
    line(joined, 'chat.joined', 'chat.joinedMany');
    line(left, 'chat.left', 'chat.leftMany');
  }
  const connect = () =>
    net.connect(
      profile.value.name,
      { color: profile.value.color, avatar: profile.value.avatar },
      hostToken.value ?? undefined,
    );
  effect(() => {
    if (phase.value === 'playing') connect();
  });
  addEventListener('pagehide', () => net.disconnect()); // leave promptly, don't wait out the grace period
  addEventListener('pageshow', (e) => {
    if (e.persisted && phase.value === 'playing') connect(); // restored from the back/forward cache
  });

  const near = (x: number, z: number, r: number) => Math.hypot(x - player.pos.x, z - player.pos.z) < r;
  /** The closest other person within `r` metres, if any. */
  const nearest = (r: number) => {
    let best: { x: number; z: number } | null = null;
    let d = r;
    for (const o of remotes.players.values()) {
      const dist = Math.hypot(o.pose.x - player.pos.x, o.pose.z - player.pos.z);
      if (o.visible && dist < d && Math.abs(o.pose.y - player.pos.y) < 1) {
        d = dist;
        best = { x: o.pose.x, z: o.pose.z };
      }
    }
    return best;
  };

  const wire = { x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 };
  let steps = 0;
  let dotsAt = 0;
  const feet = new Vector3();

  return {
    net,
    sendChat: (text: string) => net.send({ t: 'chat', text }),
    report: (id: number) => net.send({ t: 'report', id }),
    /** Emote: shown right away for you, and sent to people nearby when online. */
    emote(e: string) {
      // a hug turns you to the nearest person (they turn back when it reaches them)
      const to = e === HUG ? nearest(HUG_RANGE) : null;
      if (to) player.facing = Math.atan2(-(to.x - player.pos.x), -(to.z - player.pos.z));
      if (net.online) net.send({ t: 'emote', e });
      else {
        onSelfEmote(e);
        bubbles.show('me', e, true);
      }
    },
    /** Tell people nearby about an apple you threw. */
    /** Tell the room you changed character or colour. */
    setLook(look: { color: string; avatar?: string }) {
      if (net.online) net.send({ t: 'look', look });
    },
    throwApple(o: [number, number, number], v: [number, number, number]) {
      if (net.online) net.send({ t: 'throw', o, v });
    },
    remotes,
    /** Is anyone else in view walking or running? (Keeps the frame rate up while they do.) */
    anyoneMoving() {
      for (const r of remotes.players.values()) if (r.visible && animSpeed(r.pose.anim) > 0.3) return true;
      return false;
    },
    /** Avatars loaded: remote players switch from capsules to their characters. */
    setAvatarKit: (kit: AvatarKit) => crowd.setKit(kit),
    /** Every simulation step: send our movement at 15 Hz (every 4th 60 Hz step). */
    step() {
      if (++steps % 4 !== 0 || !net.online) return;
      wire.x = player.pos.x;
      wire.y = player.pos.y;
      wire.z = player.pos.z;
      wire.yaw = player.facing;
      wire.anim = packAnim(animState(player, seated()), player.speed);
      wire.flags = player.grounded ? FLAG_GROUNDED : 0;
      net.sendInput(wire);
    },
    /** Every frame: move everyone else, and refresh minimap dots twice a second. */
    render(now: number, camera: Camera, me: Vector3, width: number, height: number) {
      remotes.update(now);
      crowd.update(remotes, camera, now / 1000);
      bubbles.update(camera, width, height, (key) => {
        if (key === 'me') return me;
        const r = remotes.players.get(key);
        return r?.visible ? (feet.set(r.pose.x, r.pose.y, r.pose.z) as Vector3) : null;
      });
      if (now - dotsAt < 500) return;
      dotsAt = now;
      const list: { x: number; z: number; floor: number; color: string }[] = [];
      for (const r of remotes.players.values())
        if (r.visible)
          list.push({ x: r.pose.x, z: r.pose.z, floor: floorAt(r.pose.y + 0.1), color: r.info.look.color });
      if (list.length || others.value.length) others.value = list;
    },
  };
}
