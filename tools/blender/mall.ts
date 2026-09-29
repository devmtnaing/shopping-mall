// pnpm mall [-- --samples 512 --size 4096 --exposure 0.14] — rebuild the built-in mall (issue #2):
// Blender dresses the greybox and bakes its lighting (tools/blender/build.py), then
// tools/assets/mall.ts embeds the lightmap into client/public/assets/mall/mall.glb.
// Needs Blender 4.2+ (set BLENDER if it isn't in /Applications). About 2 minutes on an M-series GPU.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const script = resolve(import.meta.dirname, 'build.py');
const args = process.argv.slice(2).filter((a) => a !== '--');
const bake = spawnSync(blender, ['-b', '--factory-startup', '-P', script, '--', ...args], {
  stdio: 'inherit',
});
if (bake.status !== 0) process.exit(bake.status ?? 1);
const embed = spawnSync('node', [resolve(import.meta.dirname, '../assets/mall.ts')], { stdio: 'inherit' });
process.exit(embed.status ?? 1);
