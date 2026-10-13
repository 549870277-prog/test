/**
 * 图算法核心：邻接矩阵 → 全源最短路（Floyd–Warshall）→ 前驱回溯 → 穷举法 TSP
 * 纯计算模块，不依赖 DOM / Three.js，可在 Node 中直接单测。
 *
 * 设计要点：
 *  - 距离一律使用「已录入的可步行道路长度」（length_m），不使用直线距离。
 *  - 非连通节点对记为 Infinity，取路时自动标记为不可达，绝不伪造连接。
 *  - n ≤ 5 时穷举排列数 ≤ 24，毫秒级；穷举法保证全局最优，优于启发式。
 */

/** 步行速度标准（米/分钟），依据 PRD 5.1 与东湖绿道实际节奏 */
export const INTENSITY = {
  easy:   { key: 'easy',   label: '轻度散步', speedMpm: 50,  speedKmh: 3,  note: '东湖绿道散步节奏' },
  medium: { key: 'medium', label: '中度徒步', speedMpm: 75,  speedKmh: 4.5, note: '正常步行速度' },
  ride:   { key: 'ride',   label: '重度骑行', speedMpm: 200, speedKmh: 12, note: '共享单车绿道骑行' },
};

/** 可用时段（分钟），仅用于提示路线是否超出时段合理范围，不参与距离优化 */
export const PERIOD = {
  all:    { key: 'all',    label: '全天', budgetMin: 570, hint: '08:00–17:30' },
  morning:{ key: 'morning',label: '上午', budgetMin: 240, hint: '08:00–12:00' },
  afternoon:{ key:'afternoon', label: '下午', budgetMin: 270, hint: '13:00–17:30' },
};

const INF = Number.POSITIVE_INFINITY;

/**
 * 构建路网图。
 * @param {Array} nodes 节点数组，元素含 node_id
 * @param {Array} roads 道路数组，元素含 { edge_id, from_node, to_node, length_m, polyline }
 * @returns 图对象：含索引、邻接矩阵、前驱表、边几何索引
 */
export function buildGraph(nodes, roads) {
  const ids = nodes.map((n) => n.node_id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const N = ids.length;

  // 邻接矩阵（无向图，对称）
  const dist = Array.from({ length: N }, () => new Array(N).fill(INF));
  for (let i = 0; i < N; i += 1) dist[i][i] = 0;

  // 边几何索引：key = "from|to" 按字典序，保留原始折线方向与端点
  const edgeGeom = new Map();
  const edgeMeta = new Map();

  for (const r of roads) {
    const a = index.get(r.from_node);
    const b = index.get(r.to_node);
    if (a === undefined || b === undefined) continue;
    const w = Number(r.length_m);
    if (!(w > 0)) continue;
    // 同一条道路重复录入时取较短者（PRD：不伪造连接，取已核实的最短可步行道路）
    if (w < dist[a][b]) {
      dist[a][b] = w;
      dist[b][a] = w;
    }
    const key = [r.from_node, r.to_node].sort().join('|');
    edgeGeom.set(key, { from: r.from_node, to: r.to_node, polyline: r.polyline ?? [] });
    edgeMeta.set(key, r);
  }

  // Floyd–Warshall：同时维护前驱矩阵，O(n³)，n=10 时为 1000 次运算
  const next = Array.from({ length: N }, (_, i) => new Array(N).fill(null));
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      if (i !== j && dist[i][j] < INF) next[i][j] = j;
    }
  }
  for (let k = 0; k < N; k += 1) {
    for (let i = 0; i < N; i += 1) {
      if (dist[i][k] === INF) continue;
      for (let j = 0; j < N; j += 1) {
        const cand = dist[i][k] + dist[k][j];
        if (cand < dist[i][j]) {
          dist[i][j] = cand;
          next[i][j] = next[i][k];
        }
      }
    }
  }

  /** 取两节点间最短道路距离；不可达返回 Infinity */
  const distance = (fromId, toId) => {
    const i = index.get(fromId);
    const j = index.get(toId);
    if (i === undefined || j === undefined) return INF;
    return dist[i][j];
  };

  /** 回溯两节点间的最短路径节点序列（含首尾）；不可达返回 null */
  const path = (fromId, toId) => {
    const i = index.get(fromId);
    const j = index.get(toId);
    if (i === undefined || j === undefined) return null;
    if (dist[i][j] === INF) return null;
    const out = [ids[i]];
    let cur = i;
    let guard = 0;
    while (cur !== j) {
      cur = next[cur][j];
      if (cur === null || guard++ > N) return null;
      out.push(ids[cur]);
    }
    return out;
  };

  /**
   * 取两点之间的道路折线（米坐标），自动处理方向反转。
   * 仅适用于直接相邻的两点；不相邻返回空数组。
   */
  const legGeometry = (fromId, toId) => {
    const key = [fromId, toId].sort().join('|');
    const e = edgeGeom.get(key);
    if (!e) return [];
    const pts = e.polyline.map((p) => [Number(p[0]), Number(p[1])]);
    if (e.from === fromId && e.to === toId) return pts;
    return pts.reverse();
  };

  /** 拼接一条最短路径的完整折线几何（米坐标） */
  const pathGeometry = (nodePath) => {
    if (!nodePath || nodePath.length < 2) return [];
    const out = [];
    for (let i = 0; i < nodePath.length - 1; i += 1) {
      const seg = legGeometry(nodePath[i], nodePath[i + 1]);
      if (!seg.length) continue;
      // 去掉与上一段重复的衔接点
      const startIdx = out.length && seg.length ? 1 : 0;
      for (let k = startIdx; k < seg.length; k += 1) out.push(seg[k]);
    }
    return out;
  };

  const edgeOf = (a, b) => edgeMeta.get([a, b].sort().join('|')) ?? null;

  return { ids, index, dist, next, distance, path, legGeometry, pathGeometry, edgeOf, isConnected: (a, b) => distance(a, b) < INF };
}

/** 全排列生成器 */
export function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((item, i) => {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    permutations(rest).forEach((p) => out.push([item, ...p]));
  });
  return out;
}

/**
 * 用穷举法求带固定起终点的 TSP 最优访问顺序。
 * @param {object} graph buildGraph 产物
 * @param {string} startId 起点
 * @param {string} endId 终点
 * @param {string[]} middleIds 中间景点（不含起终点）
 * @returns {{ order: string[], total: number, unreachable: string[] } | null}
 */
export function bestOrder(graph, startId, endId, middleIds) {
  const perms = permutations(middleIds);
  let best = null;
  const unreachableSet = new Set();
  let allUnreachable = true;

  for (const perm of perms) {
    const order = [startId, ...perm, endId];
    let total = 0;
    let ok = true;
    for (let i = 0; i < order.length - 1; i += 1) {
      const d = graph.distance(order[i], order[i + 1]);
      if (!Number.isFinite(d)) { ok = false; unreachableSet.add(order[i + 1]); break; }
      total += d;
    }
    if (!ok) continue;
    allUnreachable = false;
    if (best === null || total < best.total - 1e-9) best = { order, total, unreachable: [] };
  }

  if (best === null) {
    return { order: [], total: INF, unreachable: allUnreachable ? [...unreachableSet] : [...unreachableSet] };
  }
  return best;
}

/** 按给定顺序累计总距离；存在不可达段时返回 { reachable:false, unreachable:[...] } */
export function orderDistance(graph, order) {
  let total = 0;
  const unreachable = [];
  for (let i = 0; i < order.length - 1; i += 1) {
    const d = graph.distance(order[i], order[i + 1]);
    if (!Number.isFinite(d)) { unreachable.push(order[i + 1]); continue; }
    total += d;
  }
  return { total, reachable: unreachable.length === 0, unreachable };
}
