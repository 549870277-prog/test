/**
 * 由 blender_model/tingtao_network.json 生成站点种子数据。
 * 产出：
 *   app/data/seed.js        —— 前端 ES Module 种子（节点 + 道路 + 地图元数据）
 *   supabase/seed.sql       —— Supabase 建表后的种子 SQL
 *   public/covers/*.svg     —— 各节点封面图（本地生成，无外部依赖）
 *
 * 坐标说明：
 *   xy(m)          —— 示意平面坐标，原点为片区矩形中心，X 向东、Y 向北
 *   wgs84          —— 由 bbox_wgs84 线性映射得到（示意，非实测）
 *   model_position —— Three.js 场景坐标 = [x/500, 0.006, -y/500]（比例 1:500）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NET = JSON.parse(fs.readFileSync(path.join(ROOT, 'blender_model/tingtao_network.json'), 'utf8'));

const [minLng, minLat, maxLng, maxLat] = NET.bbox_wgs84;
const [W, H] = NET.extent_m;
const SCALE = NET.scale; // 500

/** 节点补充元数据（示意文案，上线前必须核实替换） */
const META = {
  entry: { order: 1,  cover: 'entry',  desc: '听涛景区西侧主入口，紧邻梨园广场与绿道起点。进园后沿主步道向东，即可依次到达行吟阁、碧潭观鱼等景点。' },
  A:     { order: 2,  cover: 'junction', desc: '主步道与滨湖支路的分岔口：向北通往行吟阁，向西南通往碧潭观鱼，是进园后的第一个方向决策点。' },
  p1:    { order: 3,  cover: 'pavilion', desc: '纪念屈原的仿古楼阁，三层重檐，登阁可俯瞰东湖水面，是听涛景区的标志性建筑。' },
  p2:    { order: 4,  cover: 'pond',     desc: '临水观鱼景点，池水清澈、锦鲤成群，设亲水平台与休憩廊架，适合停留拍照。' },
  p3:    { order: 5,  cover: 'tower',    desc: '湖岸观景楼阁，视野开阔，是观赏湖面全景与日出日落的好位置。' },
  p4:    { order: 6,  cover: 'waterside',desc: '临湖木质水榭，三面临水，傍晚落霞倒映水面，是听涛景区的经典拍摄点。' },
  p5:    { order: 7,  cover: 'garden',   desc: '以苍翠柏木成景的林下园区，步道平缓、树荫充足，适合慢行休憩与避暑。' },
  B:     { order: 8,  cover: 'junction', desc: '听涛路与湖边步道的交汇口：向东往长天楼方向，向东南可继续前往湖岸岔路口。' },
  C:     { order: 9,  cover: 'junction', desc: '湖岸线与园区道路的岔路口，向南通往听涛东大门，是离园前的最后一个节点。' },
  exit:  { order: 10, cover: 'entry',    desc: '听涛景区东侧出口，紧邻湖岸道路，可由此外出离园，也可作为反向游览的起点。' },
};

const KIND_LABEL = { entry: '入口', junction: '路口', poi: '景点' };

const toRad = (d) => (d * Math.PI) / 180;
/** 由经纬度算等距近似米（与 bbox 映射互不干扰，仅用于展示） */
const haversine = (a, b) => {
  const R = 6371008.8;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const nodes = Object.entries(NET.nodes).map(([id, n]) => {
  const [x, y] = n.xy;
  const lng = minLng + ((x + W / 2) / W) * (maxLng - minLng);
  const lat = minLat + ((y + H / 2) / H) * (maxLat - minLat);
  const meta = META[id] ?? { order: 99, cover: 'poi', desc: '' };
  return {
    node_id: id,
    name: n.name,
    type: n.kind,           // entry | junction | poi
    kind_label: KIND_LABEL[n.kind] ?? n.kind,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    x_m: x,
    y_m: y,
    desc: meta.desc,
    duration_min: n.minutes ?? 0,
    cover_img: `./public/covers/${id}.svg`,
    sort_order: meta.order,
    coordinate_status: n.coordinate_status,
  };
});

const byId = Object.fromEntries(nodes.map((n) => [n.node_id, n]));

const edges = NET.edges.map((e) => {
  const a = byId[e.from];
  const b = byId[e.to];
  return {
    id: e.id,
    from_node: e.from,
    to_node: e.to,
    from_name: a.name,
    to_name: b.name,
    length_m: e.estimated_length_m,
    width_m: e.width_m,
    polyline: e.polyline_schematic_m,          // 折线端点 + 途经点，示意
    straight_m: Math.round(haversine([a.lng, a.lat], [b.lng, b.lat])),
    surveyed: false,
  };
});

// ---------- 道路：保留折线几何（前端据此推导路口转向并绘制 3D 路线） ----------
const roads = edges.map((e) => ({
  id: e.id,
  edge_id: e.id,
  from_node: e.from_node,
  to_node: e.to_node,
  from_name: e.from_name,
  to_name: e.to_name,
  length_m: e.length_m,
  width_m: e.width_m,
  course: e.width_m >= 3 ? '主步道' : '支路',
  polyline: e.polyline,
  surveyed: e.surveyed,
}));

const meta = {
  source: 'blender_model/tingtao_network.json',
  status: NET.status,
  status_label: '示意图，不可用于实地导航',
  scale: SCALE,
  extent_m: NET.extent_m,
  bbox_wgs84: NET.bbox_wgs84,
  model_height_m: 0.006,
  generator: 'tools/gen_seed.mjs',
  generated_at: new Date().toISOString(),
};

// ============ 1) 前端种子 app/data/seed.js ============
const jsHeader = `/**
 * 本文件由 tools/gen_seed.mjs 自动生成，请勿手工编辑。
 * 数据来源：blender_model/tingtao_network.json（示意数据，${meta.status_label}）
 * 重新生成： node tools/gen_seed.mjs
 */
`;
const js = `${jsHeader}export const MAP_META = ${JSON.stringify(meta, null, 2)};

export const NODES = ${JSON.stringify(nodes, null, 2)};

export const ROADS = ${JSON.stringify(roads, null, 2)};
`;
fs.mkdirSync(path.join(ROOT, 'app/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'app/data/seed.js'), js, 'utf8');

// ============ 2) Supabase 种子 supabase/seed.sql ============
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? 'null' : String(v));

const nodeRows = nodes.map((x) => `(${q(x.node_id)}, ${q(x.name)}, ${q(x.type)}, ${n(x.lat)}, ${n(x.lng)}, ${n(x.x_m)}, ${n(x.y_m)}, ${q(x.desc)}, ${n(x.duration_min)}, ${q(x.cover_img)}, ${n(x.sort_order)}, ${q(x.coordinate_status)})`).join(',\n  ');

const edgeRows = edges.map((e) => `(${q(e.id)}, ${q(e.from_node)}, ${q(e.to_node)}, ${n(e.length_m)}, ${n(e.width_m)}, ${q(JSON.stringify(e.polyline))}::jsonb, ${e.surveyed})`).join(',\n  ');

const sql = `-- ============================================================
-- 东湖旅游导览系统 · Supabase 种子数据（自动生成，勿手工编辑）
-- 来源：blender_model/tingtao_network.json（示意数据，不可用于实地导航）
-- 生成：node tools/gen_seed.mjs
-- ============================================================

insert into public.nodes
  (node_id, name, type, lat, lng, x_m, y_m, desc, duration_min, cover_img, sort_order, coordinate_status)
values
  ${nodeRows}
on conflict (node_id) do update set
  name = excluded.name,
  type = excluded.type,
  lat = excluded.lat,
  lng = excluded.lng,
  x_m = excluded.x_m,
  y_m = excluded.y_m,
  desc = excluded.desc,
  duration_min = excluded.duration_min,
  cover_img = excluded.cover_img,
  sort_order = excluded.sort_order,
  coordinate_status = excluded.coordinate_status;

insert into public.edges
  (id, from_node, to_node, length_m, width_m, polyline, surveyed)
values
  ${edgeRows}
on conflict (id) do update set
  from_node = excluded.from_node,
  to_node = excluded.to_node,
  length_m = excluded.length_m,
  width_m = excluded.width_m,
  polyline = excluded.polyline,
  surveyed = excluded.surveyed;
`;
fs.mkdirSync(path.join(ROOT, 'supabase'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'supabase/seed.sql'), sql, 'utf8');

// ============ 3) 封面图 public/covers/*.svg ============
const PALETTE = {
  entry:    ['#0F2E5C', '#1A3C6E'],
  junction: ['#2C5C93', '#1A3C6E'],
  pavilion: ['#1A3C6E', '#2F6FA8'],
  pond:     ['#12507A', '#2A8FB8'],
  tower:    ['#1B3A66', '#3D6EA5'],
  waterside:['#173A63', '#2F7FA8'],
  garden:   ['#174D4A', '#1A3C6E'],
  poi:      ['#1A3C6E', '#3D6EA5'],
};

const svgCover = (cover, title, sub) => {
  const [c1, c2] = PALETTE[cover] ?? PALETTE.poi;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity=".04"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <circle cx="548" cy="72" r="160" fill="#ffffff" opacity=".06"/>
  <circle cx="88" cy="352" r="200" fill="#ffffff" opacity=".05"/>
  <path d="M0 288 Q120 246 240 274 T470 258 T640 286 L640 400 L0 400Z" fill="url(#w)"/>
  <path d="M0 322 Q140 292 260 312 T500 300 T640 324 L640 400 L0 400Z" fill="#ffffff" opacity=".07"/>
  <g fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="3">
    <path d="M96 176 L96 96 M64 176 L128 176"/>
    <path d="M96 96 L68 68 M96 96 L124 68 M96 68 L96 96 M68 96 L124 96"/>
  </g>
  <text x="180" y="152" fill="#ffffff" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="54" font-weight="700">${title}</text>
  <text x="182" y="194" fill="#ffffff" fill-opacity=".78" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="21" letter-spacing="3">${sub}</text>
  <text x="36" y="376" fill="#ffffff" fill-opacity=".55" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-size="15">示意图 · 待核实替换为实景照片</text>
</svg>
`;
};

fs.mkdirSync(path.join(ROOT, 'public/covers'), { recursive: true });
for (const nd of nodes) {
  const cover = (META[nd.node_id] ?? {}).cover ?? 'poi';
  fs.writeFileSync(path.join(ROOT, 'public/covers', `${nd.node_id}.svg`), svgCover(cover, nd.name, nd.kind_label), 'utf8');
}

// ============ 4) 控制台自检 ============
const adj = new Map(nodes.map((x) => [x.node_id, []]));
for (const e of edges) {
  adj.get(e.from_node).push(e.to_node);
  adj.get(e.to_node).push(e.from_node);
}
const seen = new Set(['entry']);
const stack = ['entry'];
while (stack.length) {
  const cur = stack.pop();
  for (const nx of adj.get(cur)) if (!seen.has(nx)) { seen.add(nx); stack.push(nx); }
}
console.log(`节点 ${nodes.length} 个，道路 ${edges.length} 条`);
console.log(`连通检查：从 entry 可达 ${seen.size}/${nodes.length} 个节点 ${seen.size === nodes.length ? '✔ 全连通' : '✘ 存在孤岛：' + nodes.filter((x) => !seen.has(x.node_id)).map((x) => x.node_id).join(',')}`);
console.log(`道路总里程：${edges.reduce((s, e) => s + e.length_m, 0)} m`);
console.log('已写出：app/data/seed.js, supabase/seed.sql, public/covers/*.svg');
