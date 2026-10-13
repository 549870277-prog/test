/**
 * 解析 GLB 容器与 glTF JSON 块，导出节点名、变换、标记 bbox 与 extras。
 * 用法：node tools/inspect_glb.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] ?? path.resolve(import.meta.dirname, '../public/tingtao.glb');
const buf = fs.readFileSync(file);

const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error('不是有效的 GLB 文件');
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
let off = 12;
let json = null;
const chunks = [];
while (off < total) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  chunks.push({ type: type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : '0x' + type.toString(16), len });
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  off += 8 + len;
}
const round = (v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v);

console.log('GLB v' + version + '  ' + (buf.length / 1048576).toFixed(2) + ' MB  分块：' + chunks.map((c) => c.type + '(' + c.len + 'B)').join(', '));
console.log('资产：generator=' + json.asset?.generator + ' version=' + json.asset?.version);
console.log('节点 ' + json.nodes.length + ' / 网格 ' + json.meshes.length + ' / 材质 ' + (json.materials?.length ?? 0) + ' / 场景 ' + (json.scenes?.length ?? 0));

const nameOf = (n) => n.name ?? '(无名)';
const markerNodes = json.nodes.filter((n) => /^marker_/.test(nameOf(n)));
const roadNodes = json.nodes.filter((n) => /^road_/.test(nameOf(n)));
console.log('\n标记对象 ' + markerNodes.length + ' 个：' + markerNodes.map(nameOf).join(', '));
console.log('道路对象 ' + roadNodes.length + ' 个');

const bboxOfMesh = (mi) => {
  const mesh = json.meshes[mi];
  let mn = [Infinity, Infinity, Infinity];
  let mx = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.primitives) {
    const acc = json.accessors[p.attributes.POSITION];
    if (acc?.min && acc?.max) {
      mn = mn.map((v, i) => Math.min(v, acc.min[i]));
      mx = mx.map((v, i) => Math.max(v, acc.max[i]));
    }
  }
  return { mn, mx };
};

const fmt = (a) => '[' + a.map(round).join(', ') + ']';

console.log('\n--- 标记对象（变换 + mesh 尺寸，模型单位）---');
for (const n of markerNodes) {
  const t = n.translation ?? [0, 0, 0];
  const s = n.scale ?? [1, 1, 1];
  let sizeTxt = '';
  if (n.mesh !== undefined) {
    const { mn, mx } = bboxOfMesh(n.mesh);
    sizeTxt = '  mesh尺寸=' + fmt(mn.map((v, i) => (mx[i] - v) * (s[i] ?? 1)));
  }
  console.log('  ' + nameOf(n).padEnd(14) + ' translation=' + fmt(t) + ' scale=' + fmt(s) + sizeTxt);
  if (n.extras) console.log('      extras=' + JSON.stringify(n.extras));
}

console.log('\n--- 前 3 条道路对象 ---');
for (const n of roadNodes.slice(0, 3)) {
  const t = n.translation ?? [0, 0, 0];
  const ex = JSON.stringify(n.extras ?? {});
  console.log('  ' + nameOf(n).padEnd(22) + ' translation=' + fmt(t) + ' extras=' + ex);
}

let gmn = [Infinity, Infinity, Infinity];
let gmx = [-Infinity, -Infinity, -Infinity];
for (const n of json.nodes) {
  if (n.mesh === undefined) continue;
  const { mn, mx } = bboxOfMesh(n.mesh);
  const t = n.translation ?? [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    gmn[i] = Math.min(gmn[i], mn[i] + t[i]);
    gmx[i] = Math.max(gmx[i], mx[i] + t[i]);
  }
}
console.log('\n场景整体 AABB 下界=' + fmt(gmn) + ' 上界=' + fmt(gmx));
console.log('尺寸=' + fmt(gmx.map((v, i) => v - gmn[i])) + '（X 东西 / Y 上下 / Z 南北）');
const W = 862.6432015552285 / 500;
const H = 834.8961809495516 / 500;
console.log('\n范围 ' + round(W) + ' × ' + round(H) + ' 模型单位，应位于 AABB 中部；相机需按此取景。');
