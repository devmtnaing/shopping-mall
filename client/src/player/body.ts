// Placeholder body until avatars land (T-209): a capsule with a "nose" so you can see which way it faces.
import { PLAYER } from '@plaza/shared/constants';
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

export function createPlaceholderBody(color = '#e2b857') {
  const { radius: r, height: h } = PLAYER;
  const mat = new MeshStandardMaterial({ color, roughness: 0.5 });
  const group = new Group();
  const capsule = new Mesh(new CapsuleGeometry(r, h - 2 * r, 6, 16), mat);
  capsule.position.y = h / 2;
  const nose = new Mesh(new BoxGeometry(0.16, 0.1, 0.22), new MeshStandardMaterial({ color: '#1b1a18' }));
  nose.position.set(0, h - 0.3, -r);
  group.add(capsule, nose);
  return { group, setColor: (c: string) => mat.color.set(c) };
}
