// Multiplayer wiring: the server connection, everyone else's avatars, sending your movement,
// and the room state the UI shows. Without a server this all quietly does nothing.

import { ANIM, FLAG_GROUNDED, packAnim } from '@plaza/shared/protocol';
import { effect } from '@preact/signals';
import type { Camera, Scene } from 'three';
import { Vector3 } from 'three';
import { t } from '../i18n';
import type { PlayerController } from '../player/controller';
import type { Travel } from '../player/travel';
import { Bubbles } from '../render/bubbles';
import { Crowd } from '../render/crowd';
import { addChat, muted, netStatus, others, phase, profile, roomCount, toast } from '../state';
import { Remotes } from './remotes';
import { NetClient, serverUrl } from './socket';

/** Coarse animation state for the wire: remote players animate from this. */
function animState(p: PlayerController) {
  if (!p.grounded) return p.vel.y > 0 ? ANIM.jump : ANIM.fall;
  if (p.speed > 4.5) return ANIM.run;
  return p.speed > 0.3 ? ANIM.walk : ANIM.idle;
}

export function createMultiplayer(opts: {
  scene: Scene;
  player: PlayerController;
  travel: Travel;
  /** Floor index for a height (for minimap dots). */
  floorAt: (y: number) => number;
}) {
  const { scene, player, travel, floorAt } = opts;
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
      if (m.t === 'emote') return bubbles.show(m.id === net.selfId ? 'me' : m.id, m.e, true);
      if (m.t === 'error' && m.code === 'rate') return toast(t('chat.slowDown'));
      if (m.t === 'welcome') remotes.welcome(m.id, m.players);
      else if (m.t === 'presence') {
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
  const connect = () => net.connect(profile.value.name, { color: profile.value.color });
  effect(() => {
    if (phase.value === 'playing') connect();
  });
  addEventListener('pagehide', () => net.disconnect()); // leave promptly, don't wait out the grace period
  addEventListener('pageshow', (e) => {
    if (e.persisted && phase.value === 'playing') connect(); // restored from the back/forward cache
  });

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
      if (net.online) net.send({ t: 'emote', e });
      else bubbles.show('me', e, true);
    },
    remotes,
    /** Every simulation step: send our movement at 15 Hz (every 4th 60 Hz step). */
    step() {
      if (++steps % 4 !== 0 || !net.online) return;
      wire.x = player.pos.x;
      wire.y = player.pos.y;
      wire.z = player.pos.z;
      wire.yaw = player.facing;
      wire.anim = packAnim(animState(player), player.speed);
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
