// pnpm navgrid — bakes client/public/assets/mall/navgrid.bin from the collision mesh and meta.
// The baking itself lives in shared/src/bake.ts; the server runs the same code on uploaded malls.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bakeNavGrid, readTriangles } from '@shopping-mall/shared/bake';
import { metaSchema } from '@shopping-mall/shared/meta';
import { encodeNavGrid } from '@shopping-mall/shared/navgrid';

const DIR = resolve(import.meta.dirname, '../client/public/assets/mall');

const meta = metaSchema.parse(JSON.parse(readFileSync(`${DIR}/mall.meta.json`, 'utf8')));
const grid = bakeNavGrid(await readTriangles(readFileSync(`${DIR}/greybox.collision.glb`)), meta);
const bin = encodeNavGrid(grid);
writeFileSync(`${DIR}/navgrid.bin`, bin);
const walkable = grid.cells.map((f) => f.reduce((n, v) => n + (v > 0 ? 1 : 0), 0));
console.log(
  `navgrid: ${grid.cols}×${grid.rows} cells × ${grid.floorY.length} floors, walkable ${walkable.join(' / ')}, ` +
    `${grid.links.length} links, ${(bin.byteLength / 1024).toFixed(1)} KB`,
);
