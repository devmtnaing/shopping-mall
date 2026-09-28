// Tiny flat-shaded geometry builder for the greybox: axis-aligned boxes and prisms, grouped by material.

export type V3 = [number, number, number];

export type Part = { positions: number[]; normals: number[] };

export class Geo {
  /** Triangles per material name. */
  readonly parts = new Map<string, Part>();
  /** Triangles that the player and camera collide with. */
  readonly collision: number[] = [];

  private tri(mat: string, collide: boolean, a: V3, b: V3, c: V3) {
    let part = this.parts.get(mat);
    if (!part) {
      part = { positions: [], normals: [] };
      this.parts.set(mat, part);
    }
    const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const p of [a, b, c]) {
      part.positions.push(...p);
      part.normals.push(nx / len, ny / len, nz / len);
      if (collide) this.collision.push(...p);
    }
  }

  /** Counter-clockwise quad (seen from the side it faces). */
  private quad(mat: string, collide: boolean, a: V3, b: V3, c: V3, d: V3) {
    this.tri(mat, collide, a, b, c);
    this.tri(mat, collide, a, c, d);
  }

  /** Axis-aligned box from min to max corner. */
  box(mat: string, min: V3, max: V3, collide = true) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const q = (a: V3, b: V3, c: V3, d: V3) => this.quad(mat, collide, a, b, c, d);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // +z
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // −z
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // +x
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // −x
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // +y
    q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // −y
  }

  /**
   * Prism: a convex polygon in the (z, y) plane, extruded along x from x0 to x1.
   * Points go counter-clockwise with z to the right and y up. Used for escalator wedges and side panels.
   */
  xprism(mat: string, x0: number, x1: number, zy: [number, number][], collide = true) {
    const n = zy.length;
    const at = (x: number, i: number): V3 => {
      const [pz, py] = zy[i % n] as [number, number];
      return [x, py, pz];
    };
    // caps (fan)
    for (let i = 1; i < n - 1; i++) {
      this.tri(mat, collide, at(x1, 0), at(x1, i + 1), at(x1, i));
      this.tri(mat, collide, at(x0, 0), at(x0, i), at(x0, i + 1));
    }
    // sides
    for (let i = 0; i < n; i++) this.quad(mat, collide, at(x0, i), at(x1, i), at(x1, i + 1), at(x0, i + 1));
  }
}
