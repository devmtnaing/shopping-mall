// A* over the baked navgrid, then string-pulling so paths are a few straight legs, not a staircase.
// Nodes are (floor, cell). Neighbours: 8-connected cells whose ground heights differ by at most
// one step (so planter and bench tops aren't walked onto), plus escalator links between floors.
import { PLAYER } from '@plaza/shared/constants';
import type { NavGrid } from '@plaza/shared/navgrid';

export type Waypoint = { x: number; y: number; z: number };

const SQRT2 = Math.SQRT2;
// 8 neighbours as flat arrays (column step, row step, cost in cells): faster than tuples in the hot loop
const DC = [1, -1, 0, 0, 1, 1, -1, -1];
const DR = [0, 0, 1, -1, 1, -1, 1, -1];
const DW = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

export class PathFinder {
  private readonly g: Float32Array;
  private readonly from: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private stamp = 0;
  private readonly heap: Int32Array;
  private readonly heapF: Float32Array;
  private heapSize = 0;
  /** Links indexed by node, both directions. */
  private readonly linksAt = new Map<number, { to: number; cost: number }[]>();
  /** 1 where a node has links, so the hot loop skips the Map lookup almost always. */
  private readonly hasLink: Uint8Array;

  constructor(private readonly nav: NavGrid) {
    const n = nav.size * nav.floorY.length;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n);
    this.heapF = new Float32Array(n);
    this.hasLink = new Uint8Array(n);
    for (const l of nav.links) {
      const a = l.floorA * nav.size + l.cellA;
      const b = l.floorB * nav.size + l.cellB;
      this.link(a, b, l.cost);
      this.link(b, a, l.cost);
    }
  }

  /**
   * Path from one world point to another, as waypoints (start excluded, goal included), or null
   * when the goal can't be reached on foot.
   */
  find(from: Waypoint, to: Waypoint): Waypoint[] | null {
    const nav = this.nav;
    const start = this.nearest(nav.floorAt(from.y + 0.1), from.x, from.y, from.z);
    const goal = this.nearest(nav.floorAt(to.y + 0.1), to.x, to.y, to.z);
    if (start < 0 || goal < 0) return null;
    const nodes = this.search(start, goal);
    if (!nodes) return null;
    const pts = this.smooth(nodes);
    // finish exactly where asked when that spot is on the goal cell's ground
    const last = pts[pts.length - 1];
    if (last && this.cellOf(goal) === nav.index(to.x, to.z)) {
      last.x = to.x;
      last.z = to.z;
    }
    return pts;
  }

  private link(a: number, b: number, cost: number) {
    this.hasLink[a] = 1;
    const list = this.linksAt.get(a) ?? [];
    list.push({ to: b, cost });
    this.linksAt.set(a, list);
  }

  private cellOf(node: number) {
    return node % this.nav.size;
  }

  private floorOf(node: number) {
    return Math.floor(node / this.nav.size);
  }

  /**
   * Nearest walkable node to (x, y, z) on a floor, searching outward up to 2 m. Cells more than a
   * step above or below `y` don't count (so a point beside a bench never snaps onto the bench top).
   */
  private nearest(floor: number, x: number, y: number, z: number): number {
    const nav = this.nav;
    const ok = (j: number) =>
      nav.walkable(floor, j) && Math.abs(nav.height(floor, j) - y) <= PLAYER.stepHeight;
    const i = nav.index(x, z);
    if (ok(i)) return floor * nav.size + i;
    const c0 = Math.floor((x - nav.originX) / nav.cell);
    const r0 = Math.floor((z - nav.originZ) / nav.cell);
    const maxRing = Math.ceil(2 / nav.cell);
    for (let ring = 1; ring <= maxRing; ring++) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) continue;
          const j = r * nav.cols + c;
          if (!ok(j)) continue;
          const d = dr * dr + dc * dc;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
      if (best >= 0) return floor * nav.size + best;
    }
    return -1;
  }

  private search(start: number, goal: number): number[] | null {
    const nav = this.nav;
    const { cols, rows, size, cell, cells } = nav;
    const step = PLAYER.stepHeight * 100; // heights are stored in cm steps (value - 1)
    this.stamp++;
    this.heapSize = 0;
    const goalCell = this.cellOf(goal);
    const gc = goalCell % cols;
    const gr = (goalCell - gc) / cols;
    // octile distance in metres; the tiny factor breaks ties toward the goal (far fewer expansions)
    const h = (c: number, r: number) => {
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return (Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)) * cell * 1.001;
    };
    const s0 = this.cellOf(start);
    this.open(start, 0, h(s0 % cols, Math.floor(s0 / cols)), -1);

    while (this.heapSize > 0) {
      const node = this.pop();
      if (node === goal) return this.trace(goal);
      if (this.closed[node] === this.stamp) continue;
      this.closed[node] = this.stamp;
      const g0 = this.g[node] as number;
      const floor = (node / size) | 0;
      const grid = cells[floor] as Uint8Array;
      const i = node - floor * size;
      const c = i % cols;
      const r = (i - c) / cols;
      const v0 = grid[i] as number;

      for (let d = 0; d < 8; d++) {
        const dc = DC[d] as number;
        const dr = DR[d] as number;
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        const v = grid[j] as number;
        if (v === 0 || Math.abs(v - v0) > step) continue;
        // no cutting corners diagonally past a wall
        if (dc !== 0 && dr !== 0 && (grid[r * cols + cc] === 0 || grid[rr * cols + c] === 0)) continue;
        const next = floor * size + j;
        if (this.closed[next] === this.stamp) continue;
        this.open(next, g0 + (DW[d] as number) * cell, h(cc, rr), node);
      }
      const links = this.hasLink[node] ? this.linksAt.get(node) : undefined;
      if (links) {
        for (const l of links) {
          if (this.closed[l.to] === this.stamp) continue;
          const lc = this.cellOf(l.to);
          this.open(l.to, g0 + l.cost, h(lc % cols, Math.floor(lc / cols)), node);
        }
      }
    }
    return null;
  }

  private open(node: number, g: number, h: number, parent: number) {
    if (this.seen[node] === this.stamp && (this.g[node] ?? 0) <= g) return;
    this.seen[node] = this.stamp;
    this.g[node] = g;
    this.from[node] = parent;
    // binary heap push (duplicates allowed; stale entries are skipped via `closed`)
    let k = this.heapSize++;
    const f = g + h;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if ((this.heapF[p] ?? 0) <= f) break;
      this.heap[k] = this.heap[p] ?? 0;
      this.heapF[k] = this.heapF[p] ?? 0;
      k = p;
    }
    this.heap[k] = node;
    this.heapF[k] = f;
  }

  private pop(): number {
    const top = this.heap[0] ?? 0;
    const n = --this.heapSize;
    const node = this.heap[n] ?? 0;
    const f = this.heapF[n] ?? 0;
    let k = 0;
    for (;;) {
      let child = 2 * k + 1;
      if (child >= n) break;
      if (child + 1 < n && (this.heapF[child + 1] ?? 0) < (this.heapF[child] ?? 0)) child++;
      if ((this.heapF[child] ?? 0) >= f) break;
      this.heap[k] = this.heap[child] ?? 0;
      this.heapF[k] = this.heapF[child] ?? 0;
      k = child;
    }
    this.heap[k] = node;
    this.heapF[k] = f;
    return top;
  }

  private trace(goal: number): number[] {
    const out: number[] = [];
    for (let n = goal; n >= 0; n = this.from[n] ?? -1) out.push(n);
    return out.reverse();
  }

  /** Keep only the nodes needed to walk in straight lines (line of sight on the grid); links split legs. */
  private smooth(nodes: number[]): Waypoint[] {
    const nav = this.nav;
    const pts: Waypoint[] = [];
    const wp = (node: number): Waypoint => {
      const f = this.floorOf(node);
      const i = this.cellOf(node);
      const [x, z] = nav.center(i);
      return { x, y: nav.height(f, i), z };
    };
    const visible = (a: number, k: number) =>
      this.floorOf(nodes[k] ?? 0) === this.floorOf(nodes[a] ?? 0) &&
      !this.crossesLink(nodes, a, k) &&
      this.lineOfSight(nodes[a] ?? 0, nodes[k] ?? 0);
    let anchor = 0;
    while (anchor < nodes.length - 1) {
      // gallop outward while visible, then binary-search the edge: O(log n) sight checks per leg
      const lastIdx = nodes.length - 1;
      let lo = anchor + 1;
      let span = 1;
      let hi = lastIdx + 1;
      while (lo + span <= lastIdx) {
        if (!visible(anchor, lo + span)) {
          hi = lo + span;
          break;
        }
        lo += span;
        span *= 2;
      }
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (visible(anchor, mid)) lo = mid;
        else hi = mid;
      }
      const far = lo;
      pts.push(wp(nodes[far] ?? 0));
      anchor = far;
    }
    return pts;
  }

  private crossesLink(nodes: number[], a: number, b: number) {
    for (let k = a; k < b; k++)
      if (this.floorOf(nodes[k] ?? 0) !== this.floorOf(nodes[k + 1] ?? 0)) return true;
    return false;
  }

  /** Walk the segment in small steps; every sample must be walkable and within a step of the last. */
  private lineOfSight(a: number, b: number): boolean {
    const nav = this.nav;
    const floor = this.floorOf(a);
    const [ax, az] = nav.center(this.cellOf(a));
    const [bx, bz] = nav.center(this.cellOf(b));
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / (nav.cell * 0.5));
    let hPrev = nav.height(floor, this.cellOf(a));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      // check the cell and its neighbours across the path's width, so legs don't clip wall corners
      for (const [ox, oz] of [
        [0, 0],
        [0.12, 0.12],
        [-0.12, -0.12],
        [0.12, -0.12],
        [-0.12, 0.12],
      ] as const) {
        const i = nav.index(x + ox, z + oz);
        if (!nav.walkable(floor, i)) return false;
        if (Math.abs(nav.height(floor, i) - hPrev) > PLAYER.stepHeight) return false;
      }
      hPrev = nav.height(floor, nav.index(x, z));
    }
    return true;
  }
}
