/**
 * 核心算法自检：node tools/test_core.mjs
 * 覆盖：图连通性、最短路正确性、穷举法最优性、原路线对比、不可达处理、单景点边界。
 */
import { NODES, ROADS } from '../app/data/seed.js';
import { buildGraph, permutations, INTENSITY } from '../app/core/graph.js';
import { planRoute, planToText } from '../app/core/route.js';

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✔ ${label}`); }
  else { fail += 1; console.log(`  ✘ ${label} ${extra}`); }
};

const graph = buildGraph(NODES, ROADS);

console.log('\n[1] 图构建与连通性');
ok(NODES.length === 10, `节点数 = 10（实际 ${NODES.length}）`);
ok(ROADS.length === 12, `道路数 = 12（实际 ${ROADS.length}）`);
ok(graph.ids.every((id) => graph.ids.every((j) => Number.isFinite(graph.distance(id, j)))), '10×10 全节点对均可达');

console.log('\n[2] 最短道路距离（直接相邻边应等于录入长度）');
for (const r of ROADS) {
  const d = graph.distance(r.from_node, r.to_node);
  ok(Math.abs(d - r.length_m) < 1e-6, `${r.from_node}→${r.to_node} = ${r.length_m}m`, `实际 ${d}`);
}

console.log('\n[3] 绕行（非直连必须经由路口，不得用直线距离代替）');
const entryToP3 = graph.distance('entry', 'p3');
const straight = ROADS.find((r) => r.from_node === 'entry' && r.to_node === 'p3');
ok(straight === undefined, 'entry 与 p3 之间无直接道路');
ok(entryToP3 === 300 + 550 + 600, `entry→p3 经 A、p1 绕行 = 1450m`, `实际 ${entryToP3}`);
const pathEntryP3 = graph.path('entry', 'p3');
ok(pathEntryP3.join('>') === 'entry>A>p1>p3', `路径回溯 = entry>A>p1>p3`, `实际 ${pathEntryP3.join('>')}`);

console.log('\n[4] 穷举法：排列数与最优性');
const mid = ['p1', 'p2', 'p4'];
ok(permutations(mid).length === 6, '3 个中间景点 → 3! = 6 种排列');

const plan = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p2', 'p4', 'p3'], endId: 'p3', intensity: 'medium' });
ok(plan.ok === true, '规划成功');
ok(plan.permCount === 6, `枚举排列数 = 6（实际 ${plan.permCount}）`);
ok(plan.recommended.total_m <= plan.original.total_m, `推荐距离(${plan.recommended.total_m}) ≤ 原路线(${plan.original.total_m})`);
ok(plan.middle.length === 3, '中间景点 = 3（起点/终点已排除）');

// 独立复核：手工枚举 6 种顺序，取最小
const manual = permutations(['p1', 'p2', 'p4'])
  .map((p) => {
    const o = ['entry', ...p, 'p3'];
    let t = 0;
    for (let i = 0; i < o.length - 1; i += 1) t += graph.distance(o[i], o[i + 1]);
    return { o, t };
  })
  .sort((a, b) => a.t - b.t);
ok(Math.abs(plan.recommended.total_m - manual[0].t) < 1e-6,
  `与独立枚举结果一致 = ${manual[0].t}m`, `实际 ${plan.recommended.total_m}`);
ok(plan.recommended.order.join('>') === manual[0].o.join('>'),
  `最优顺序 = ${manual[0].o.join('>')}`, `实际 ${plan.recommended.order.join('>')}`);
ok(plan.alternatives.length === 2, `候选路线另列出 ${plan.alternatives.length} 条（按距离升序）`);
ok(plan.alternatives.every((a, i) => a.total_m >= (i === 0 ? plan.recommended.total_m : plan.alternatives[i - 1].total_m)),
  '候选路线按距离升序排列');

console.log('\n[5] 路线详情与路口转向（需展开途经路口）');
ok(plan.recommended.fullPath.join('>') === 'entry>A>p1>p2>p4>B>p3',
  `展开途经路口 = entry>A>p1>p2>p4>B>p3`, `实际 ${plan.recommended.fullPath.join('>')}`);
ok(plan.recommended.legs.length === 6, `行程段数 = 6（实际 ${plan.recommended.legs.length}）`);
ok(plan.recommended.order[0] === 'entry' && plan.recommended.order.at(-1) === 'p3', '起终点固定不变');
const covered = new Set(plan.recommended.fullPath);
ok(['p1', 'p2', 'p4', 'p3'].every((s) => covered.has(s)), '所有所选景点均被经过');
ok(plan.recommended.legs.reduce((s, l) => s + l.distance_m, 0) === plan.recommended.total_m, '分段距离之和 = 总步行距离');
ok(plan.recommended.stops.length === 4, `景点停留条目 = 4（行吟阁/碧潭观鱼/落霞水榭/长天楼，实际 ${plan.recommended.stops.length}）`);
const juncLeg = plan.recommended.legs.find((l) => l.to_type === 'junction' && l.turn);
ok(!!juncLeg, '途经路口给出转向提示', JSON.stringify(juncLeg?.turn));
if (juncLeg) console.log(`    示例：${juncLeg.hint}`);
ok(plan.recommended.walk_min === Math.round(plan.recommended.total_m / 75), '步行时间按 75 m/min 换算');
ok(plan.recommended.visit_min === 30 + 20 + 15 + 20, `景点停留合计 = 85 分钟（实际 ${plan.recommended.visit_min}）`);

console.log('\n[6] 文字路线（地图不可用时仍可读）');
const text = planToText(plan, new Map(NODES.map((n) => [n.node_id, n])));
console.log(text.split('\n').map((l) => `    ${l}`).join('\n'));
ok(text.includes('【推荐路线】') && text.includes('节省距离'), '文字路线含起终点、逐段距离与节省距离');

console.log('\n[7] 边界：不可达景点（切段后苍柏园 p5 成为孤岛）');
const brokenRoads = ROADS.filter((r) => r.id !== 'road_09_p3_p5' && r.id !== 'road_10_p5_exit');
const badGraph = buildGraph(NODES, brokenRoads);
ok(!Number.isFinite(badGraph.distance('entry', 'p5')), '切段后 entry→p5 不可达');
const bad = planRoute({ nodes: NODES, roads: brokenRoads, startId: 'entry', sightIds: ['p1', 'p5'], endId: 'p5' });
ok(bad.ok === false && bad.code === 'NO_ROUTE', `存在孤岛时返回 NO_ROUTE（实际 ${bad.code}）`);
ok(bad.unreachable.some((u) => u.node_id === 'p5'), `指出不可达景点：${bad.unreachable.map((u) => u.name).join('、')}`);
ok(String(bad.message).includes('苍柏园'), '提示文案点名不可达景点，要求修改选择');

console.log('\n[8] 边界：单景点 / 起点即景点 / 超限');
const one = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1'] });
ok(one.ok && one.recommended.fullPath.join('>') === 'entry>A>p1' && one.recommended.legs.length === 2, '单景点展开为 起点→路口A→景点，共 2 段');
const startIsPoi = planRoute({ nodes: NODES, roads: ROADS, startId: 'p1', sightIds: ['p1', 'p2'] });
ok(startIsPoi.ok && startIsPoi.recommended.order[0] === 'p1', '起点本身为景点时不重复计入');
ok(startIsPoi.recommended.visit_min >= (30 + 20), '起点为景点时其建议游览时长仍计入');
const tooMany = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'entry'] });
ok(tooMany.ok === false && tooMany.code === 'TOO_MANY', '超过 5 个景点被拒绝');
const none = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: [] });
ok(none.ok === false && none.code === 'NO_SIGHT', '未选景点被拒绝');
const dup = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p1', 'p1'] });
ok(dup.ok && dup.recommended.order.filter((x) => x === 'p1').length === 1, '重复加入同一景点自动去重（同一景点不能重复加入）');

console.log('\n[9] 时段与强度提示');
// 把道路长度放大 4 倍模拟「半天走不完」的场景
const longRoads = ROADS.map((r) => ({ ...r, length_m: r.length_m * 4 }));
const tight = planRoute({ nodes: NODES, roads: longRoads, startId: 'entry', sightIds: ['p1', 'p2', 'p3', 'p4', 'p5'], intensity: 'easy', period: 'morning' });
ok(tight.warnings.some((w) => w.includes('超出该时段')), `超时段给出提示（含停留 ${tight.recommended.total_min} 分钟 > 240 分钟）`);
const roomy = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p2'], intensity: 'medium', period: 'all' });
ok(!roomy.warnings.some((w) => w.includes('超出该时段')), '时段充裕时不误报超时');
const ride = planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p2'], intensity: 'ride' });
ok(ride.recommended.walk_min < one.recommended.walk_min + 1, `骑行速度(${INTENSITY.ride.speedMpm} m/min)快于徒步`);

console.log('\n[10] 性能（穷举法应在毫秒级完成）');
const t0 = performance.now();
for (let i = 0; i < 200; i += 1) {
  planRoute({ nodes: NODES, roads: ROADS, startId: 'entry', sightIds: ['p1', 'p2', 'p3', 'p4', 'p5'], intensity: 'medium' });
}
const per = (performance.now() - t0) / 200;
ok(per < 50, `5 景点全流程平均耗时 ${per.toFixed(2)} ms（远低于 3000ms 验收目标）`);

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail === 0 ? 0 : 1);
