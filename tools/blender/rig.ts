// pnpm rig — puts each generated character on the Kenney rig (tools/blender/rig.py), writing
// assets-src/avatars/higgsfield/rigged/<id>.glb and <id>.png. Needs Blender (BLENDER=/path/to/blender,
// or blender on the PATH). The results are committed, so `pnpm assets` doesn't need Blender.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../../assets-src/avatars/higgsfield');
/** Each generated character, and the turn (degrees about up) that makes it face +Z like Kenney's. */
export const GENERATED: { id: string; turn: number }[] = [
  { id: 'burmese-woman', turn: -90 },
  { id: 'burmese-man', turn: -90 },
  { id: 'student', turn: -90 },
];

const blender = process.env.BLENDER ?? 'blender';
const only = process.argv[2];
mkdirSync(`${DIR}/rigged`, { recursive: true });
for (const { id, turn } of GENERATED) {
  if (only && id !== only) continue;
  const run = spawnSync(
    blender,
    [
      '-b',
      '--factory-startup',
      '-P',
      resolve(import.meta.dirname, 'rig.py'),
      '--',
      `${DIR}/${id}.glb`,
      `${DIR}/rigged/${id}.glb`,
      '--turn',
      String(turn),
    ],
    { encoding: 'utf8' },
  );
  const log = `${run.stdout}${run.stderr}`;
  for (const line of log.split('\n')) if (line.startsWith('rig:')) console.log(`${id}: ${line.slice(5)}`);
  if (run.status !== 0 || !log.includes('rig: wrote')) {
    console.error(log);
    process.exit(1);
  }
}
