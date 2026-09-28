// Walkable grid for pathfinding, baked from the collision mesh by tools/bake-navgrid.ts.
//
// Binary layout (little-endian), `navgrid.bin`:
//   "PNAV" u8 version | f32 cell | f32 originX | f32 originZ | u16 cols (x) | u16 rows (z) | u8 floors
//   per floor: f32 y, u32 runCount, runs of (u16 length, u8 value)   value 0 = blocked,
//              otherwise walkable at height floorY + (value - 1) / 100
//   u8 linkCount, per link: u8 floorA, u32 cellA, u8 floorB, u32 cellB, f32 cost
// A cell index is row * cols + col, where col = floor((x - originX) / cell), row = floor((z - originZ) / cell).

export type NavLink = { floorA: number; cellA: number; floorB: number; cellB: number; cost: number };

export class NavGrid {
  readonly cell: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cols: number;
  readonly rows: number;
  readonly floorY: number[];
  /** One byte per cell per floor (see layout above). */
  readonly cells: Uint8Array[];
  readonly links: NavLink[];

  constructor(
    cell: number,
    originX: number,
    originZ: number,
    cols: number,
    rows: number,
    floorY: number[],
    cells: Uint8Array[],
    links: NavLink[],
  ) {
    this.cell = cell;
    this.originX = originX;
    this.originZ = originZ;
    this.cols = cols;
    this.rows = rows;
    this.floorY = floorY;
    this.cells = cells;
    this.links = links;
  }

  get size() {
    return this.cols * this.rows;
  }

  /** Cell index for a world x/z, or -1 when outside the grid. */
  index(x: number, z: number): number {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((z - this.originZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /** World x/z of a cell's centre. */
  center(i: number): [number, number] {
    const c = i % this.cols;
    const r = (i - c) / this.cols;
    return [this.originX + (c + 0.5) * this.cell, this.originZ + (r + 0.5) * this.cell];
  }

  walkable(floor: number, i: number): boolean {
    return i >= 0 && (this.cells[floor]?.[i] ?? 0) > 0;
  }

  /** Ground height of a walkable cell. */
  height(floor: number, i: number): number {
    return (this.floorY[floor] ?? 0) + ((this.cells[floor]?.[i] ?? 1) - 1) / 100;
  }

  /** The floor whose ground is closest below-or-at `y` (within a metre). */
  floorAt(y: number): number {
    let best = 0;
    for (let f = 0; f < this.floorY.length; f++) if (y >= (this.floorY[f] ?? 0) - 1) best = f;
    return best;
  }
}

export function encodeNavGrid(g: NavGrid): Uint8Array {
  const bytes: number[] = [];
  const view = new DataView(new ArrayBuffer(8));
  const push = (n: number, write: (v: DataView) => void) => {
    write(view);
    for (let i = 0; i < n; i++) bytes.push(view.getUint8(i));
  };
  const f32 = (v: number) => push(4, (d) => d.setFloat32(0, v, true));
  const u32 = (v: number) => push(4, (d) => d.setUint32(0, v, true));
  const u16 = (v: number) => push(2, (d) => d.setUint16(0, v, true));
  const u8 = (v: number) => bytes.push(v & 255);

  for (const ch of 'PNAV') u8(ch.charCodeAt(0));
  u8(1);
  f32(g.cell);
  f32(g.originX);
  f32(g.originZ);
  u16(g.cols);
  u16(g.rows);
  u8(g.floorY.length);
  g.cells.forEach((cells, f) => {
    f32(g.floorY[f] ?? 0);
    const runs: [number, number][] = [];
    for (let i = 0; i < cells.length; ) {
      const v = cells[i] ?? 0;
      let n = 1;
      while (i + n < cells.length && cells[i + n] === v && n < 65535) n++;
      runs.push([n, v]);
      i += n;
    }
    u32(runs.length);
    for (const [n, v] of runs) {
      u16(n);
      u8(v);
    }
  });
  u8(g.links.length);
  for (const l of g.links) {
    u8(l.floorA);
    u32(l.cellA);
    u8(l.floorB);
    u32(l.cellB);
    f32(l.cost);
  }
  return new Uint8Array(bytes);
}

export function decodeNavGrid(buf: ArrayBuffer): NavGrid {
  const d = new DataView(buf);
  let o = 5;
  const magic = String.fromCharCode(d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3));
  if (magic !== 'PNAV' || d.getUint8(4) !== 1) throw new Error('navgrid: not a PNAV v1 file');
  const take = (n: number) => {
    o += n;
    return o - n;
  };
  const f32 = () => d.getFloat32(take(4), true);
  const u32 = () => d.getUint32(take(4), true);
  const u16 = () => d.getUint16(take(2), true);
  const u8 = () => d.getUint8(take(1));
  const cell = f32();
  const originX = f32();
  const originZ = f32();
  const cols = u16();
  const rows = u16();
  const floors = u8();
  const floorY: number[] = [];
  const cells: Uint8Array[] = [];
  for (let f = 0; f < floors; f++) {
    floorY.push(f32());
    const out = new Uint8Array(cols * rows);
    let i = 0;
    for (let runs = u32(); runs > 0; runs--) {
      const n = u16();
      out.fill(u8(), i, i + n);
      i += n;
    }
    cells.push(out);
  }
  const links: NavLink[] = [];
  for (let n = u8(); n > 0; n--)
    links.push({ floorA: u8(), cellA: u32(), floorB: u8(), cellB: u32(), cost: f32() });
  return new NavGrid(cell, originX, originZ, cols, rows, floorY, cells, links);
}
