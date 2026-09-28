import type { Pose } from '@shopping-mall/shared/protocol';
import { describe, expect, it } from 'vitest';
import { Remotes } from '../src/net/remotes';

const TICK = 1000 / 15;
const pose = (x: number): Pose => ({ x, y: 0, z: 0, yaw: 0, anim: 0, flags: 1 });
const look = { color: '#e2b857' };

function feed(r: Remotes, id: number, ticks: number, from = 0) {
  for (let t = from; t < from + ticks; t++) {
    r.beginSnapshot(t, t * TICK);
    r.snapshot(id, pose(t * 0.2), t * TICK);
  }
}

describe('Remotes', () => {
  it('knows the room from welcome and presence, and never includes you', () => {
    const r = new Remotes();
    r.welcome(1, [{ id: 2, name: 'Bo', look }]);
    r.presence(
      [
        { id: 3, name: 'Cee', look },
        { id: 1, name: 'Me', look },
      ],
      [],
    );
    expect([...r.players.keys()]).toEqual([2, 3]);
    r.presence([], [2]);
    expect([...r.players.keys()]).toEqual([3]);
  });

  it('shows someone once their snapshots arrive, 100 ms in the past', () => {
    const r = new Remotes();
    r.welcome(1, [{ id: 2, name: 'Bo', look }]);
    feed(r, 2, 10);
    r.update(9 * TICK);
    const bo = r.players.get(2);
    expect(bo?.visible).toBe(true);
    expect(bo?.pose.x).toBeLessThan(9 * 0.2); // behind the newest snapshot
    expect(bo?.pose.x).toBeGreaterThan(6 * 0.2);
  });

  it('hides someone who stops appearing in snapshots (out of range)', () => {
    const r = new Remotes();
    r.welcome(1, [{ id: 2, name: 'Bo', look }]);
    feed(r, 2, 5);
    r.update(5 * TICK + 2000);
    expect(r.players.get(2)?.visible).toBe(false);
  });

  it('shows an unknown mover right away and names them when presence arrives', () => {
    const r = new Remotes();
    r.welcome(1, []);
    const v0 = r.version;
    feed(r, 9, 3);
    expect(r.players.get(9)?.info.name).toBe('');
    expect(r.version).toBeGreaterThan(v0);
    r.presence([{ id: 9, name: 'Late', look }], []);
    expect(r.players.get(9)?.info.name).toBe('Late');
  });

  it('ignores snapshots of yourself', () => {
    const r = new Remotes();
    r.welcome(1, []);
    feed(r, 1, 3);
    expect(r.players.size).toBe(0);
  });
});
