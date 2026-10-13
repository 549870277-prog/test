"""Run in Blender. Schematic layout from user-supplied estimates; NOT survey data."""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

OUT = Path(r'D:\[公众号]\武汉东湖游览程序\blender_model')
OUT.mkdir(parents=True, exist_ok=True)
S = 1 / 500
W = 6378137 * math.cos(math.radians(30.56775)) * math.radians(.009)
H = 6378137 * math.radians(.0075)

def enum(obj, prop, wanted):
    choices = [v.identifier for v in obj.bl_rna.properties[prop].enum_items]
    if wanted not in choices: raise ValueError((prop, wanted, choices))
    setattr(obj, prop, wanted)

scene = bpy.data.scenes.new('东湖听涛 · 示意沙盘')
bpy.context.window.scene = scene
enum(scene.unit_settings, 'system', 'METRIC')
scene['data_status'] = 'SCHEMATIC_NOT_SURVEYED'
scene['scale_denominator'] = 500
scene['bounds_wgs84'] = [114.3605, 30.5640, 114.3695, 30.5715]
groups = {}
for n in ['01_地形与湖面','02_步行路网','03_景点建筑','04_标记与文字','05_植被','06_展示']:
    c = bpy.data.collections.new(n); scene.collection.children.link(c); groups[n[:2]] = c

def mat(name, color, rough=.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.diffuse_color = (*color,1)
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    next(i for i in n.inputs if i.identifier == 'Base Color').default_value = (*color,1)
    next(i for i in n.inputs if i.identifier == 'Roughness').default_value = rough
    return m

grass = mat('草地 · 鼠尾草绿',(.30,.48,.28))
water = mat('东湖 · 青蓝',(.065,.36,.43),.32)
bank = mat('驳岸 · 浅砂',(.65,.64,.43))
pathmat = mat('主步道 · 米白',(.88,.80,.60))
branchmat = mat('支路 · 浅杏',(.65,.52,.33))
ink = mat('深蓝灰',(.025,.07,.085))
white = mat('暖白',(.96,.94,.83))
roofmat = mat('青瓦',(.045,.13,.15))
wood = mat('木柱 · 朱砂',(.37,.14,.075))
gold = mat('景点 · 琥珀',(.95,.48,.075))
entry = mat('梨园入口 · 青绿',(.02,.57,.38))
exitmat = mat('东门 · 珊瑚',(.85,.20,.12))
leafmats = [mat('树冠'+str(i),c) for i,c in enumerate([(.09,.25,.16),(.15,.34,.20),(.24,.42,.22),(.34,.47,.23)])]

def mesh(name, verts, faces, material, group='01'):
    me=bpy.data.meshes.new(name); me.from_pydata([(x*S,y*S,z*S) for x,y,z in verts],[],faces); me.update()
    ob=bpy.data.objects.new(name,me); groups[group].objects.link(ob); ob.data.materials.append(material); return ob

def box(name,x,y,z,w,d,h,material,group='03'):
    vs=[(x+a*w/2,y+b*d/2,z+c*h) for c in [0,1] for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material,group)

def ring(name,x,y,z,r,h,material,group='03',r2=None,n=12):
    if r2 is None:r2=r
    v=[(x+rr*math.cos(i*2*math.pi/n),y+rr*math.sin(i*2*math.pi/n),zz) for rr,zz in [(r,z),(r2,z+h)] for i in range(n)]
    f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,material,group)

fontpath=Path('C:/Windows/Fonts/msyh.ttc')
font=bpy.data.fonts.load(str(fontpath)) if fontpath.exists() else None
def text(name,body,x,y,z,size,material=ink):
    ty=next(i.identifier for i in bpy.data.curves.bl_rna.functions['new'].parameters['type'].enum_items if i.identifier=='FONT')
    cu=bpy.data.curves.new(name,ty); cu.body=body; cu.size=size*S; cu.extrude=.12*S
    if font:cu.font=font
    enum(cu,'align_x','CENTER')
    ob=bpy.data.objects.new(name,cu); groups['04'].objects.link(ob); ob.location=(x*S,y*S,z*S); cu.materials.append(material); return ob

def ribbon(name,pts,width,material=pathmat,z=3,group='02'):
    vs=[]
    for i,p in enumerate(pts):
        a=Vector(pts[max(0,i-1)]); b=Vector(pts[min(len(pts)-1,i+1)]); t=(b-a).normalized(); n=Vector((-t.y,t.x))*width/2
        vs.extend([(p[0]+n.x,p[1]+n.y,z),(p[0]-n.x,p[1]-n.y,z)])
    return mesh(name,vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(pts)-1)],material,group)

# Display plinth includes a south title margin; geographic rectangle is W x H.
box('沙盘底座',0,-35,-24,W+40,H+130,20,ink,'01')
box('湖面矩形',0,0,-3,W,H,3,water,'01')
shore=[(130,H/2),(160,360),(145,300),(210,250),(225,180),(200,125),(240,70),(210,15),(240,-50),(300,-110),(305,-180),(340,-230),(365,-285),(W/2,-340),(W/2,-H/2)]
land=[(-W/2,H/2)]+shore+[(-W/2,-H/2)]
mesh('陆地区域_示意岸线',[(x,y,1.5) for x,y in land],[tuple(reversed(range(len(land))))],grass)
ribbon('自然湖岸',shore,5,bank,2,'01')
ribbon('东湖路_北界与西界',[(-W/2+10,-H/2),(-W/2+10,H/2-10),(W/2,H/2-10)],10,ink,3)

nodes={
 'entry':{'name':'梨园广场入口','xy':[-W/2+28,H/2-28],'kind':'entry'},
 'A':{'name':'绿道分岔口','xy':[-260,245],'kind':'junction'},
 'p1':{'name':'行吟阁','xy':[100,215],'kind':'poi','minutes':30},
 'p2':{'name':'碧潭观鱼','xy':[-95,120],'kind':'poi','minutes':20},
 'p3':{'name':'长天楼','xy':[160,-125],'kind':'poi','minutes':20},
 'p4':{'name':'落霞水榭','xy':[175,25],'kind':'poi','minutes':15},
 'p5':{'name':'苍柏园','xy':[-40,-280],'kind':'poi','minutes':20},
 'B':{'name':'听涛路交汇口','xy':[-120,-95],'kind':'junction'},
 'C':{'name':'湖岸岔路口','xy':[280,-255],'kind':'junction'},
 'exit':{'name':'听涛东大门','xy':[W/2-28,-H/2+28],'kind':'entry'} }
edges=[('entry','A',300,[(-340,330)]),('A','p1',550,[(-150,295),(0,275)]),('A','p2',400,[(-220,170),(-155,165)]),('p1','p2',200,[(40,150)]),('p1','p3',600,[(140,130),(120,55),(120,-35)]),('p2','p4',350,[(-35,60),(65,65)]),('p4','B',300,[(80,-15),(-25,-45)]),('B','p3',450,[(-60,-170),(55,-185)]),('p3','p5',350,[(100,-230),(40,-250)]),('p5','exit',400,[(80,-330),(230,-345)]),('p3','C',250,[(240,-170)]),('C','exit',300,[(320,-325)])]
paths=[]; network=[]
for i,(a,b,length,mids) in enumerate(edges):
    pts=[nodes[a]['xy']]+mids+[nodes[b]['xy']]; paths.append(pts)
    width=2 if i in [2,3,8] else 3
    ob=ribbon('road_%02d_%s_%s'%(i+1,a,b),pts,width,branchmat if width==2 else pathmat)
    ob['from']=a; ob['to']=b; ob['estimated_length_m']=length; ob['surveyed']=False
    network.append({'id':ob.name,'from':a,'to':b,'estimated_length_m':length,'width_m':width,'polyline_schematic_m':pts})

def pavilion(name,x,y,w=38,d=29,levels=1):
    box(name+'_台基',x,y,2,w+10,d+10,3,bank)
    for lv in range(levels):
        z=5+lv*16
        box(name+'_楼身',x,y,z,w*.7,d*.65,11,white)
        for dx in [-w*.38,w*.38]:
            for dy in [-d*.37,d*.37]:box(name+'_朱柱',x+dx,y+dy,z,2,2,13,wood)
        vs=[(x-w/2-5,y-d/2-5,z+12),(x+w/2+5,y-d/2-5,z+12),(x+w/2+5,y+d/2+5,z+12),(x-w/2-5,y+d/2+5,z+12),(x-w*.32,y,z+22),(x+w*.32,y,z+22)]
        mesh(name+'_坡屋顶',vs,[(0,1,5,4),(3,4,5,2),(0,4,3),(1,2,5),(0,3,2,1)],roofmat,'03')

pavilion('行吟阁',100,215,40,32,2)
pavilion('长天楼',160,-125,60,30,2)
pavilion('落霞水榭',175,25,40,24)
box('落霞亲水平台',184,25,2,70,45,2,wood)
ring('碧潭',-95,120,2,55,1,water,n=32)
bridge=[(-150,120),(-127,105),(-108,125),(-88,106),(-68,125),(-40,120)]
ribbon('碧潭九曲桥',bridge,5,white,5)
for dy in [-3,3]:ribbon('桥栏杆',[(x,y+dy) for x,y in bridge],.8,gold,8,'03')
pavilion('观鱼亭',-95,120,20,18)
box('苍柏园庭院',-40,-280,2,85,60,2,bank)
for dx,dy,w,d in [(-30,0,18,48),(30,0,18,48),(0,22,60,18)]:pavilion('苍柏园厢房',-40+dx,-280+dy,w,d)

for key,node in nodes.items():
    x,y=node['xy']; kind=node['kind']; color=gold if kind=='poi' else (entry if key=='entry' else exitmat if key=='exit' else ink)
    if kind=='entry':
        for dx in [-13,13]:box(key+'_门柱',x+dx,y,2,4,4,25,color)
        box(key+'_门楣',x,y,23,34,6,5,color)
    elif kind=='junction':
        box(key+'_路标柱',x,y,2,2,2,14,wood)
        box(key+'_方向牌',x,y,14,16,4,4,color)
    else:
        ring(key+'_定位底环',x,y,3,30,1,gold,'04',n=32)
    # Flat map label offset south of miniature building, readable from above.
    labely=y-43 if kind=='poi' else y-26
    label=(key[1:]+'  ' if kind=='poi' else key+'  ' if kind=='junction' else '')+node['name']
    bw=len(label)*10+14
    ob=box('marker_'+key,x,labely,7,bw,23,2,color,'04')
    ob['node_id']=key; ob['display_name']=node['name']; ob['kind']=kind; ob['surveyed']=False
    text('label_'+key,label,x,labely-6,9.5,12,white if kind!='poi' else ink)
    node['model_position']=[x*S,y*S,3*S]
    node['coordinate_status']='schematic_not_measured'

# Deterministic groves, excluded from paths, labels and building footprints.
random.seed(42)
def inside(x,y,poly):
    hit=False
    for i in range(len(poly)):
        ax,ay=poly[i-1]; bx,by=poly[i]
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:hit=not hit
    return hit
def segdist(p,a,b):
    p,a,b=Vector(p),Vector(a),Vector(b); d=b-a
    t=max(0,min(1,(p-a).dot(d)/d.length_squared)); return (p-a-t*d).length
for i in range(380):
    x=random.uniform(-W/2+30,W/2-30); y=random.uniform(-H/2+25,H/2-30)
    if not inside(x,y,land):continue
    if any(math.hypot(x-n['xy'][0],y-n['xy'][1]+15)<75 for n in nodes.values()):continue
    if any(segdist((x,y),a,b)<12 for pts in paths for a,b in zip(pts,pts[1:])):continue
    h=random.uniform(12,23); r=random.uniform(6,11)
    ring('树干',x,y,2,1.2,h*.5,wood,'05',n=6)
    ring('树冠',x,y,7,r,h,random.choice(leafmats),'05',r2=1,n=7)

text('湖名','东  湖',330,190,2,29,white)
text('湖名英文','EAST LAKE',330,162,2,10,white)
text('标题','东湖 · 听涛景区',-175,-H/2-45,1,27,white)
text('副标题','概念游览沙盘 / SCHEMATIC MODEL',-170,-H/2-66,1,9,white)
text('比例说明','1:500  |  坐标边界约 862 × 835 m',230,-H/2-35,1,9,white)
text('状态说明','岸线 / 景点 / 道路位置均为示意，待实测',220,-H/2-56,1,9,white)
text('北向','N',330,340,3,22,white)
mesh('指北针',[(330,390,3),(319,353,3),(330,362,3),(341,353,3)],[(0,1,2),(0,2,3)],white,'04')
ribbon('100米比例尺',[(240,-380),(340,-380)],3,white,3,'04')
text('比例尺文字','100 m',290,-371,3,10,white)

metadata={'status':'SCHEMATIC_NOT_FOR_NAVIGATION','scale':500,'extent_m':[W,H],'bbox_wgs84':[114.3605,30.5640,114.3695,30.5715],'axes_blender':{'x':'east','y':'north','z':'up'},'axes_glb':{'x':'east','y':'up','z':'south'},'nodes':nodes,'edges':network,'notes':['Only bounding coordinates supplied; interior geometry invented for concept visualization.','Road length attributes preserve user estimates; mesh lengths differ.','Marker and building sizes exaggerated for legibility.','Supplied area 1.2–1.5 km² contradicts coordinate bounding area about 0.72 km².']}
(OUT/'tingtao_network.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')

camdata=bpy.data.cameras.new('沙盘相机'); cam=bpy.data.objects.new('沙盘相机',camdata); groups['06'].objects.link(cam)
cam.location=(0,-2.45,3.5); target=Vector((0,-.05,0)); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
enum(camdata,'type','ORTHO'); camdata.ortho_scale=2.7; camdata.lens=45; scene.camera=cam
lighttype=next(e.identifier for e in bpy.data.lights.bl_rna.functions['new'].parameters['type'].enum_items if e.identifier=='AREA')
ld=bpy.data.lights.new('柔光',lighttype); lo=bpy.data.objects.new('柔光',ld); groups['06'].objects.link(lo); lo.location=(-1,-1,4); ld.energy=180; ld.size=3
scene.world=bpy.data.worlds.new('灰蓝背景'); scene.world.color=(.3,.3,.3)
try:scene.render.engine='CYCLES'
except TypeError:pass
if hasattr(scene,'cycles'):scene.cycles.samples=24
scene.render.resolution_x=1500; scene.render.resolution_y=1500; scene.render.resolution_percentage=100
enum(scene.render.image_settings,'file_format','PNG'); scene.render.filepath=str(OUT/'tingtao_preview.png')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active
            enum(space.shading,'color_type','MATERIAL')
            space.overlay.show_overlays=False
            space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.region_3d.view_distance=2.9
            space.region_3d.view_location=(0,-.06,0)
print('Created schematic:',len(scene.objects),'objects; extent',W,H)
