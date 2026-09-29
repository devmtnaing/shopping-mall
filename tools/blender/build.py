# Dress the greybox mall and bake its lighting (issue #2, option A: scripted, reproducible).
#
#   pnpm mall     (= blender -b --factory-startup -P tools/blender/build.py -- [--samples 512] [--size 4096]
#                 [--exposure 0.14], then tools/assets/mall.ts)
#
# Imports client/public/assets/mall/greybox.glb (so dimensions, collision and meta stay exactly the
# greybox's), culls faces nobody can see, upgrades materials, adds ceiling light panels and lights,
# lays out a lightmap UV (second UV set), bakes diffuse lighting (direct + indirect, no colour) with
# Cycles on the GPU, and writes:
#   .cache/mall/mall.glb           the dressed model, with TEXCOORD_1 for the lightmap
#   .cache/mall/lightmap.png       lighting only: L / LIGHT_SCALE, sRGB-encoded 8 bits
# (intermediates, not committed; the committed result is client/public/assets/mall/mall.glb)
# `pnpm assets` then embeds the lightmap and writes client/public/assets/mall/mall.glb.
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'client/public/assets/mall/greybox.glb')
OUT = os.path.join(ROOT, '.cache/mall')

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {args[i].lstrip('-'): args[i + 1] for i in range(0, len(args) - 1, 2)}
SAMPLES = int(opt.get('samples', 512))
SIZE = int(opt.get('size', 4096))
# stored lightmap = sRGB(L / LIGHT_SCALE): room for highlights up to 2x white, precision in the darks.
# The client loads it as an sRGB texture (decoded for free) and multiplies by LIGHT_SCALE.
LIGHT_SCALE = 2.0
# one knob for overall brightness: every light's energy is multiplied by this
EXPOSURE = float(opt.get('exposure', 0.14))

# mall dimensions (tools/greybox/layout.ts)
X_OUT, Z_END, ROOF, UP, T = 16.0, -64.0, 13.6, 7.6, 0.3
SLOT_Z0, SLOT_LEN, SLOTS = -4.0, 8.0, 6


def log(*a):
    print('[mall]', *a, flush=True)


# ---- scene -------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
world_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
log('imported', len(world_objs), 'meshes')


# ---- cull faces nobody can see ------------------------------------------------------------------
def cull(objs):
    """Delete faces that face out of the building or press against other geometry."""
    deps = bpy.context.evaluated_depsgraph_get()
    trees = []
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        trees.append(BVHTree.FromBMesh(bm))
        bm.free()
    lo = Vector((-X_OUT - T - 0.01, -T - 0.01, Z_END - T - 0.01))
    hi = Vector((X_OUT + T + 0.01, ROOF + T + 0.01, T + 0.01))
    removed = 0
    for o in objs:
        if o.name in ('glass', 'skylight'):
            continue  # thin, see-through or emissive: keep as is
        bm = bmesh.new()
        bm.from_mesh(o.data)
        mw = o.matrix_world
        doomed = []
        for f in bm.faces:
            cb = mw @ f.calc_center_median()
            nb = (mw.to_3x3() @ f.normal).normalized()
            # Blender is Z-up; the mall's numbers are glTF's Y-up
            c = Vector((cb.x, cb.z, -cb.y))
            n = Vector((nb.x, nb.z, -nb.y))
            p = c + n * 0.05
            outside = not (lo.x < p.x < hi.x and lo.y < p.y < hi.y and lo.z < p.z < hi.z)
            # the exterior skin: faces on the shell that point outwards
            skin = (
                (abs(c.x) >= X_OUT + T - 0.01 and abs(n.x) > 0.9 and c.x * n.x > 0)
                or (c.z <= Z_END - T + 0.01 and n.z < -0.9)
                or (c.z >= T - 0.01 and n.z > 0.9 and abs(c.x) >= 4)
                or (c.y <= -T + 0.01 and n.y < -0.9)
                or (c.y >= ROOF + T - 0.01 and n.y > 0.9)
            )
            covered = False
            if not (outside or skin):
                origin = cb + nb * 0.002
                for t in trees:
                    hit = t.ray_cast(origin, nb, 0.02)
                    if hit[0] is not None:
                        covered = True
                        break
            if outside or skin or covered:
                doomed.append(f)
        removed += len(doomed)
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    log('culled', removed, 'hidden faces')


if opt.get('cull', '1') != '0':
    cull(world_objs)

# ---- materials ----------------------------------------------------------------------------------
def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


# name → (base colour, roughness, metallic, emission strength)
LOOK = {
    'floor': ('#e4ded2', 0.25, 0.0, 0),
    'wall': ('#efe9df', 0.85, 0.0, 0),
    'ceiling': ('#f6f3ee', 0.95, 0.0, 0),
    'shopfloor': ('#c8bdab', 0.6, 0.0, 0),
    'trim': ('#b8955e', 0.35, 1.0, 0),
    'dark': ('#3a3732', 0.6, 0.0, 0),
    'rail': ('#9c9892', 0.3, 0.8, 0),
    'escalator': ('#5f5c57', 0.45, 0.4, 0),
    'planter': ('#e9e2d6', 0.8, 0.0, 0),
    'glass': ('#bcd4dc', 0.05, 0.0, 0),
    'skylight': ('#fff8ea', 1.0, 0.0, 6),
    'lightpanel': ('#fffaf0', 1.0, 0.0, 10),
}


# tiling detail textures, generated here so the build needs no image files: name → metres per repeat
TEX_SIZE = 512
TILED = {'floor': 1.2, 'wall': 2.4, 'ceiling': 2.4, 'shopfloor': 2.0}


def detail(name):
    """Greyscale detail (≈0.8–1.0) for a surface, TEX_SIZE² covering TILED[name] metres, tileable."""
    import numpy as np

    n = TEX_SIZE
    rng = np.random.default_rng(abs(hash(name)) % 2**32)
    y, x = np.mgrid[0:n, 0:n] / n

    def noise(scale, amp):
        # tileable value noise: random grid, bilinear, wrapped
        g = rng.random((scale, scale))
        xs, ys = x * scale, y * scale
        x0, y0 = np.floor(xs).astype(int) % scale, np.floor(ys).astype(int) % scale
        x1, y1 = (x0 + 1) % scale, (y0 + 1) % scale
        fx, fy = xs % 1, ys % 1
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        top = g[y0, x0] * (1 - fx) + g[y0, x1] * fx
        bot = g[y1, x0] * (1 - fx) + g[y1, x1] * fx
        return (top * (1 - fy) + bot * fy - 0.5) * amp

    if name == 'floor':  # 2×2 stone tiles of 0.6 m, each a touch different, soft veining, thin grout
        tile = (np.floor(x * 2) + np.floor(y * 2) * 2).astype(int)
        shade = np.array([0.0, 0.035, 0.02, -0.015])[tile]
        v = 0.95 + shade + noise(8, 0.05) + noise(32, 0.03) + noise(128, 0.015)
        grout = (np.minimum((x * 2) % 1, 1 - (x * 2) % 1) < 0.006) | (np.minimum((y * 2) % 1, 1 - (y * 2) % 1) < 0.006)
        v = np.where(grout, 0.78, v)
    elif name == 'wall':  # plaster, with a faint panel seam every 1.2 m
        v = 0.96 + noise(16, 0.03) + noise(64, 0.015)
        seam = np.minimum((x * 2) % 1, 1 - (x * 2) % 1) < 0.004
        v = np.where(seam, 0.86, v)
    elif name == 'ceiling':  # 0.6 m acoustic tiles
        v = 0.97 + noise(64, 0.02)
        grid = (np.minimum((x * 4) % 1, 1 - (x * 4) % 1) < 0.01) | (np.minimum((y * 4) % 1, 1 - (y * 4) % 1) < 0.01)
        v = np.where(grid, 0.85, v)
    else:  # shopfloor: 0.2 m wooden planks along x, staggered ends
        row = np.floor(y * 10).astype(int)
        plank = np.floor(x * 2.5 + (row % 3) * 0.37).astype(int)
        shade = rng.random((10, 8))[row % 10, plank % 8] * 0.12 - 0.06
        grain = noise(4, 0.04) + np.sin((y * 10 % 1) * 40 + noise(8, 6)) * 0.015
        gap = np.minimum((y * 10) % 1, 1 - (y * 10) % 1) < 0.02
        v = np.where(gap, 0.7, 0.93 + shade + grain)
    return np.clip(v, 0, 1)


def texture(name):
    import numpy as np

    col = np.array(srgb(LOOK[name][0])[:3])
    v = detail(name)[..., None]
    lin = col * v  # linear colour × detail
    enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    px = np.concatenate([enc, np.ones_like(v)], axis=-1).astype(np.float32)
    img = bpy.data.images.new(f'{name}-detail', TEX_SIZE, TEX_SIZE)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    col, rough, metal, emit = LOOK[name]
    bsdf.inputs['Base Color'].default_value = srgb(col)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = srgb(col)
        bsdf.inputs['Emission Strength'].default_value = emit * EXPOSURE / 0.25  # tuned at 0.25
    if name == 'glass':
        bsdf.inputs['Alpha'].default_value = 0.25
        m.surface_render_method = 'BLENDED'
    if name in TILED and not any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = texture(name)
        t.name = 'detail'
        m.node_tree.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    return m


for o in world_objs:
    if o.data.materials and o.data.materials[0].name.split('.')[0] in LOOK:
        o.data.materials[0] = material(o.data.materials[0].name.split('.')[0])


# ---- light panels and lights --------------------------------------------------------------------
def box(name, mat, lo, hi):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.location = [(a + b) / 2 for a, b in zip(lo, hi)]
    o.scale = [b - a for a, b in zip(lo, hi)]
    me.materials.append(material(mat))
    return o


def area_light(name, pos, size, energy, color=(1, 0.95, 0.88), shape='RECTANGLE', size_y=None):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy * EXPOSURE
    ld.color = color
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    o = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(o)
    o.location = pos
    return o  # area lights point down (−Z local); rotate so they point down in Y-up world below


panels = []
CEIL = UP - T
# concourse ceiling panels over the ground floor, between the atrium and the shop fronts
for z in [-6 - 8 * i for i in range(6)]:
    for x in (-4.5, 4.5):
        panels.append(box('lightpanel', 'lightpanel', (x - 0.6, CEIL - 0.04, z - 1.6), (x + 0.6, CEIL - 0.01, z + 1.6)))
# upper gallery panels under the roof
for z in [-6 - 8 * i for i in range(6)]:
    for x in (-4.5, 4.5):
        panels.append(box('lightpanel', 'lightpanel', (x - 0.6, ROOF - 0.04, z - 1.6), (x + 0.6, ROOF - 0.01, z + 1.6)))

lights = []
# each panel also gets an area light just below it (the emission alone is noisy to bake)
for p in panels:
    x, y, z = p.location
    lights.append(area_light('panel', (x, y - 0.05, z), 1.2, 90, size_y=3.2))
# shops: a warm light in each unit
for s in (-1, 1):
    for upper in (False, True):
        y = (ROOF if upper else CEIL) - 0.3
        for i in range(SLOTS):
            zc = SLOT_Z0 - i * SLOT_LEN - SLOT_LEN / 2
            lights.append(area_light('shop', (s * 11, y, zc), 5, 220, color=(1, 0.88, 0.72), size_y=6))
# flagship store and the entrance lobby
lights.append(area_light('flagship', (0, CEIL - 0.3, -59), 10, 600, color=(1, 0.9, 0.78), size_y=8))
lights.append(area_light('lobby', (0, CEIL - 0.3, -2), 6, 240, size_y=3))

# daylight through the skylight: a big soft light just under it, cool and bright
lights.append(area_light('skylight', (0, ROOF - 0.05, -30), 5.5, 3000, color=(0.92, 0.96, 1.0), size_y=43))

# area lights emit along local −Z; in this Y-up world, point them down (−Y)
for l in lights:
    l.rotation_euler = (math.radians(90), 0, 0)

# the glTF importer turns Y-up into Blender's Z-up by rotating objects; bring the new objects along
# (the importer converts glTF Y-up to Blender Z-up: +Y glTF = +Z Blender, −Z glTF = +Y Blender)
def to_blender(o):
    x, y, z = o.location
    o.location = (x, -z, y)
    if o.type == 'MESH':
        sx, sy, sz = o.scale
        o.scale = (sx, sz, sy)
    else:
        o.rotation_euler = (0, 0, 0)  # area lights already point down (−Z) in Blender's Z-up


for o in panels + lights:
    to_blender(o)

# a little ambient bounce from outside (the entrance glass)
bpy.context.scene.world = bpy.data.worlds.new('world')
bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.85, 0.9, 1.0, 1)
bg.inputs['Strength'].default_value = 0.08

# ---- one mesh, one lightmap UV ------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.split('.')[0] not in ('glass',)]
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
mall = bpy.context.view_layer.objects.active
mall.name = 'mall'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = mall.data
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
uv0 = me.uv_layers.new(name='UVMap')
# uv0: world-space box projection, so detail textures repeat at the same scale everywhere
bm = bmesh.new()
bm.from_mesh(me)
uvl = bm.loops.layers.uv['UVMap']
for f in bm.faces:
    mat = me.materials[f.material_index].name.split('.')[0] if me.materials else ''
    rep = TILED.get(mat, 1.0)
    ax = max(range(3), key=lambda i: abs(f.normal[i]))
    for loop in f.loops:
        co = loop.vert.co
        u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
        loop[uvl].uv = (u / rep, v / rep)
bm.to_mesh(me)
bm.free()
lm = me.uv_layers.new(name='Lightmap')
me.uv_layers.active = lm
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
area = sum(p.area for p in me.polygons)
log(f'mall: {len(me.polygons)} faces, {area:.0f} m² to light, ~{SIZE / math.sqrt(area):.1f} px/m at {SIZE}²')

# ---- bake -----------------------------------------------------------------------------------------
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 3

img = bpy.data.images.new('lightmap', SIZE, SIZE, float_buffer=True)
for m in me.materials:
    nt = m.node_tree
    node = nt.nodes.new('ShaderNodeTexImage')
    node.name = 'bake'
    node.image = img
    nt.nodes.active = node  # bake target
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'Lightmap'
    nt.links.new(uvn.outputs['UV'], node.inputs['Vector'])

bpy.ops.object.select_all(action='DESELECT')
mall.select_set(True)
bpy.context.view_layer.objects.active = mall
scene.render.bake.margin = 16
scene.render.bake.margin_type = 'EXTEND'
log(f'baking {SIZE}² at {SAMPLES} samples…')
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, margin=16)
log('baked')

# lighting only → sRGB(L / scale), 8 bits
import numpy as np  # noqa: E402

def denoise(src):
    """OpenImageDenoise through the compositor: an empty scene whose output is the denoised image."""
    sc = bpy.data.scenes.new('denoise')
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.use_compositing = True
    ng = bpy.data.node_groups.new('denoise', 'CompositorNodeTree')
    sc.compositing_node_group = ng
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    i = ng.nodes.new('CompositorNodeImage')
    i.image = src
    d = ng.nodes.new('CompositorNodeDenoise')
    o = ng.nodes.new('NodeGroupOutput')
    ng.links.new(i.outputs['Image'], d.inputs['Image'])
    ng.links.new(d.outputs['Image'], o.inputs[0])
    bpy.ops.render.render(scene=sc.name)
    path = os.path.join(OUT, '.denoised.exr')
    sc.render.image_settings.file_format = 'OPEN_EXR'
    bpy.data.images['Render Result'].save_render(filepath=path, scene=sc)
    out = bpy.data.images.load(path)
    a = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    out.pixels.foreach_get(a)
    os.remove(path)
    return a


os.makedirs(OUT, exist_ok=True)
px = denoise(img)
log('denoised')
rgb = px.reshape(-1, 4)[:, :3]
lin = np.clip(rgb / LIGHT_SCALE, 0, 1)
enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
px.reshape(-1, 4)[:, :3] = enc
px.reshape(-1, 4)[:, 3] = 1
out_img = bpy.data.images.new('lightmap_out', SIZE, SIZE, float_buffer=False)
out_img.colorspace_settings.name = 'Non-Color'
out_img.pixels.foreach_set(px)
out_img.filepath_raw = os.path.join(OUT, 'lightmap.png')
out_img.file_format = 'PNG'
out_img.save()
log('wrote lightmap.png; mean light', float(rgb.mean()))

# ---- export ----------------------------------------------------------------------------------------
# remove the bake nodes so the exporter sees plain materials
for m in me.materials:
    for n in list(m.node_tree.nodes):
        if (n.type == 'TEX_IMAGE' and n.name != 'detail') or n.type == 'UVMAP':
            m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, 'mall.glb'),
    export_format='GLB',
    use_selection=False,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_lights=False,
    export_cameras=False,
    export_apply=True,
)
log('wrote mall.glb')
