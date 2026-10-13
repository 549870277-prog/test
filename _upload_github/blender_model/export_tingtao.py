"""Run after build_tingtao.py in Blender; preserve editable text in .blend."""
import bpy, json, struct
from pathlib import Path
OUT=Path(r'D:\[公众号]\武汉东湖游览程序\blender_model')
scene=bpy.context.scene
depsgraph=bpy.context.evaluated_depsgraph_get()
copies=[]
selected=list(bpy.context.selected_objects)
for ob in scene.objects:ob.select_set(False)
try:
    # Explicit mesh copies ensure portable Chinese labels in glTF.
    for ob in list(scene.objects):
        if ob.type=='FONT':
            me=bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph))
            cp=bpy.data.objects.new(ob.name+'_glb',me); scene.collection.objects.link(cp)
            cp.matrix_world=ob.matrix_world.copy(); cp.select_set(True); copies.append(cp)
        elif ob.type=='MESH':ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'tingtao.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
finally:
    for cp in copies:
        me=cp.data; bpy.data.objects.remove(cp,do_unlink=True); bpy.data.meshes.remove(me)
    for ob in scene.objects:ob.select_set(False)
    for ob in selected:ob.select_set(True)

# Inspect exported binary, all 10 semantic markers and 12 road segments.
raw=(OUT/'tingtao.glb').read_bytes()
magic,version,size=struct.unpack_from('<4sII',raw)
assert magic==b'glTF' and version==2 and size==len(raw)
chunk_len,chunk_type=struct.unpack_from('<II',raw,12)
gltf=json.loads(raw[20:20+chunk_len])
markers=[n for n in gltf['nodes'] if n.get('extras',{}).get('node_id')]
roads=[n for n in gltf['nodes'] if 'estimated_length_m' in n.get('extras',{})]
assert len(markers)==10 and len(roads)==12
assert not any(n.get('name')=='Cube' for n in gltf['nodes'])
report={'glb_version':version,'bytes':size,'nodes':len(gltf['nodes']),'meshes':len(gltf['meshes']),'markers':len(markers),'roads':len(roads),'status':'passed'}
(OUT/'export_validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tingtao.blend'))
print(report)
