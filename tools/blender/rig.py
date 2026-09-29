# Put a generated character on the Kenney Mini Characters rig (issue #4, batch 5), so it plays
# every clip the Kenney characters do.
#
#   pnpm rig   (= blender -b --factory-startup -P tools/blender/rig.py -- <static.glb> <out.glb> [--turn <deg>]
#              for each character in tools/blender/rig.ts; also writes <out>.png, the picker's preview)
#
# The character must be a chibi figure like Kenney's: a big head, arms out to the sides, standing.
# `--turn` (degrees about up) turns it to face +Z, the way Kenney's characters face.
#
# Kenney's rig has seven bones (root, torso, head, arm-left/right, leg-left/right), and the clips
# only rotate them (plus the root's translation). So the script can move the joints to fit this
# character: it finds the neck, shoulders and hips in the mesh, raises the arms into Kenney's T-pose
# rest (the clips assume it), weights each part rigidly to its bone, as Kenney's are, and exports
# the skinned mesh with no clips (avatars.glb takes the clips from the Kenney characters).
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DONOR = os.path.join(ROOT, 'assets-src/avatars/kenney-mini-characters/models/character-female-a.glb')

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
opt = {args[i].lstrip('-'): args[i + 1] for i in range(2, len(args) - 1, 2)}
TURN = math.radians(float(opt.get('turn', 0)))

bpy.ops.wm.read_factory_settings(use_empty=True)


def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# the donor: Kenney's armature, in its rest pose, without its meshes
donor = imported(DONOR)
arm = next(o for o in donor if o.type == 'ARMATURE')
arm.animation_data_clear()
for o in donor:
    if o.type == 'MESH':
        bpy.data.objects.remove(o)
bpy.context.view_layer.update()
rest = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
height = 0.7755  # Kenney's standing height (glTF units), from its bounds

# the character: one mesh, facing +Z (Blender −Y), feet on the ground, centred, Kenney's height
parts = [o for o in imported(src) if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.matrix_world = Matrix.Rotation(TURN, 4, 'Z') @ body.matrix_world
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o not in (arm, body) and o.type == 'EMPTY':
        bpy.data.objects.remove(o)
vs = body.data.vertices
lo = Vector([min(v.co[i] for v in vs) for i in range(3)])
hi = Vector([max(v.co[i] for v in vs) for i in range(3)])
s = height / (hi.z - lo.z)
shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
for v in vs:
    v.co = (v.co - shift) * s
H = height


def band(z0, z1):
    return [v.co for v in vs if z0 <= v.co.z <= z1]


# neck: from the head's deepest slice (front to back), down to where the depth falls away
step = H / 60


edges = [(vs[e.vertices[0]].co.copy(), vs[e.vertices[1]].co.copy()) for e in body.data.edges]


def section(z):
    """Where the mesh's edges cross the height z: its true cross-section, even on a low-poly mesh."""
    pts = []
    for a, b in edges:
        if (a.z - z) * (b.z - z) < 0:
            t = (z - a.z) / (b.z - a.z)
            pts.append(a.lerp(b, t))
    return pts


def depth(z):
    pts = section(z)
    return max(p.y for p in pts) - min(p.y for p in pts) if pts else 0


# neck: from the head's deepest cross-section down to where the depth falls away
heights = [H * (0.25 + i / 200) for i in range(150)]
deepest = max((z for z in heights if z > 0.4 * H), key=depth)
limit = 0.75 * depth(deepest)
neck = deepest
while neck > 0.25 * H and depth(neck - step) >= limit:
    neck -= step
# the body's half-width, from the legs (nothing else is that low)
half = max(abs(c.x) for c in band(0, 0.15 * H)) * 1.15
# arms: below the neck and further out than the body
is_arm = lambda c: c.z < neck and abs(c.x) > half
arms = {1: [v for v in vs if is_arm(v.co) and v.co.x > 0], -1: [v for v in vs if is_arm(v.co) and v.co.x < 0]}
for side, vl in arms.items():
    if not vl:
        raise SystemExit(f'rig: no {"left" if side > 0 else "right"} arm found (arms must stand out from the body)')
# hips: Kenney's proportion, but always below the arms
hip = min(0.227 * H, min(v.co.z for vl in arms.values() for v in vl) - 0.02 * H)
shoulder = {}
for side, vl in arms.items():
    root = [v.co for v in vl if abs(v.co.x) < half + 0.03 * H] or [v.co for v in vl]
    sh = Vector((side * half, sum(c.y for c in root) / len(root), max(c.z for c in root) - 0.03 * H))
    tip = max(vl, key=lambda v: abs(v.co.x)).co
    # raise the arm to horizontal about the shoulder (the clips assume Kenney's T-pose rest)
    droop = math.atan2(sh.z - tip.z, abs(tip.x - sh.x))
    rot = Matrix.Rotation(-side * droop, 4, 'Y')
    for v in vl:
        v.co = sh + rot @ (v.co - sh)
    shoulder[side] = sh
print(f'rig: height {H:.3f}, neck {neck / H:.2f}H, hip {hip / H:.2f}H, shoulders {shoulder[1].z / H:.2f}H, half-width {half:.3f}')

# move the joints to fit (Kenney's arm-left is at +x)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
inv = arm.matrix_world.inverted()
eb = arm.data.edit_bones
fit = {
    'head': Vector((0, rest['head'].y, neck)),
    'arm-left': shoulder[1],
    'arm-right': shoulder[-1],
    'leg-left': Vector((half * 0.45, rest['leg-left'].y, hip)),
    'leg-right': Vector((-half * 0.45, rest['leg-right'].y, hip)),
    'torso': Vector((0, rest['torso'].y, hip)),
}
for name, p in fit.items():
    b = eb[name]
    d = b.tail - b.head
    b.head = inv @ p
    b.tail = b.head + d
bpy.ops.object.mode_set(mode='OBJECT')

# rigid weights, one bone per part
groups = {n: body.vertex_groups.new(name=n) for n in ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']}
armset = {1: {v.index for v in arms[1]}, -1: {v.index for v in arms[-1]}}
for v in vs:
    c = v.co
    if v.index in armset[1]:
        g = 'arm-left'
    elif v.index in armset[-1]:
        g = 'arm-right'
    elif c.z >= neck:
        g = 'head'
    elif c.z < hip:
        g = 'leg-left' if c.x > 0 else 'leg-right'
    else:
        g = 'torso'
    groups[g].add([v.index], 1.0, 'REPLACE')
body.parent = arm
body.matrix_parent_inverse = arm.matrix_world.inverted()
body.modifiers.new('rig', 'ARMATURE').object = arm

# the picker's 64 px preview, framed like Kenney's: from above, front and to the side, transparent
sc = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
sc.render.resolution_x = sc.render.resolution_y = 64
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('preview')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[1].default_value = 4.5
sc.world = world
cam = bpy.data.objects.new('preview', bpy.data.cameras.new('preview'))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = H * 1.45
sc.collection.objects.link(cam)
sc.camera = cam
centre = Vector((0, 0, H * 0.5))
cam.location = centre + Vector((0.8, -1.4, 1.1))
cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = os.path.splitext(out)[0] + '.png'
bpy.ops.render.render(write_still=True)
bpy.data.objects.remove(cam)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=False,
    export_skins=True,
    export_yup=True,
)
print(f'rig: wrote {out}')
