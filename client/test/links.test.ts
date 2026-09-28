import { describe, expect, it } from 'vitest';
import { linkUrl, parseLink } from '../src/links';

describe('parseLink', () => {
  it('reads a shop link', () => {
    expect(parseLink('?s=lumen-coffee')).toEqual({ kind: 'shop', id: 'lumen-coffee' });
  });

  it('reads a spot link, with defaults for yaw and floor', () => {
    expect(parseLink('?at=12.5,-30,1.57,1')).toEqual({ kind: 'at', x: 12.5, z: -30, yaw: 1.57, floor: 1 });
    expect(parseLink('?at=1,-2')).toEqual({ kind: 'at', x: 1, z: -2, yaw: 0, floor: 0 });
  });

  it('ignores junk', () => {
    expect(parseLink('')).toBeNull();
    expect(parseLink('?s=<script>')).toBeNull();
    expect(parseLink('?at=abc,1')).toBeNull();
    expect(parseLink('?at=5')).toBeNull();
  });
});

describe('linkUrl', () => {
  it('builds links that parse back to the same place', () => {
    const base = 'https://mall.example/';
    expect(linkUrl({ kind: 'shop', id: 'paper-trail' }, base)).toBe('https://mall.example/?s=paper-trail');
    const spot = linkUrl({ kind: 'at', x: 12.3456, z: -30.001, yaw: 1.5708, floor: 1 }, base);
    expect(spot).toBe('https://mall.example/?at=12.35,-30,1.57,1');
    expect(parseLink(new URL(spot).search)).toEqual({ kind: 'at', x: 12.35, z: -30, yaw: 1.57, floor: 1 });
  });
});
