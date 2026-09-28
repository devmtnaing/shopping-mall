import { describe, expect, it, vi } from 'vitest';
import { KeyState } from '../src/player/input';

const key = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  preventDefault: vi.fn(),
  ...extra,
});

describe('KeyState', () => {
  it('tracks held keys and builds a movement axis', () => {
    const k = new KeyState();
    k.down(key('KeyW'));
    k.down(key('KeyD'));
    expect(k.axis()).toEqual({ x: 1, y: 1 });
    k.up(key('KeyW'));
    expect(k.axis()).toEqual({ x: 1, y: 0 });
  });

  it('ignores keys typed into text fields', () => {
    const k = new KeyState();
    k.down(key('KeyW', { target: { tagName: 'INPUT' } }));
    k.down(key('KeyS', { target: { isContentEditable: true } }));
    expect(k.axis()).toEqual({ x: 0, y: 0 });
  });

  it('never swallows browser shortcuts like Ctrl+W or ⌘+W', () => {
    const k = new KeyState();
    const ctrlW = key('KeyW', { ctrlKey: true });
    const cmdW = key('KeyW', { metaKey: true });
    k.down(ctrlW);
    k.down(cmdW);
    expect(ctrlW.preventDefault).not.toHaveBeenCalled();
    expect(cmdW.preventDefault).not.toHaveBeenCalled();
    expect(k.isDown('KeyW')).toBe(false);
  });

  it('prevents default for game keys only', () => {
    const k = new KeyState();
    const space = key('Space');
    const f5 = key('F5');
    k.down(space);
    k.down(f5);
    expect(space.preventDefault).toHaveBeenCalled();
    expect(f5.preventDefault).not.toHaveBeenCalled();
  });

  it('reports a press once, and not for auto-repeat', () => {
    const k = new KeyState();
    k.down(key('Space'));
    k.down(key('Space', { repeat: true }));
    expect(k.consume('Space')).toBe(true);
    expect(k.consume('Space')).toBe(false);
  });

  it('releases everything on clear (window blur)', () => {
    const k = new KeyState();
    k.down(key('KeyA'));
    k.clear();
    expect(k.axis()).toEqual({ x: 0, y: 0 });
  });
});
