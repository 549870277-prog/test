/**
 * 路线规划编排层：输入起终点与景点集合 → 穷举法求解 → 输出可直接渲染的路线详情。
 * 依赖 app/core/graph.js，纯计算、无副作用。
 */
import { buildGraph, permutations, orderDistance, INTENSITY, PERIOD } from './graph.js';

const INF = Number.POSITIVE_INFINITY;

/** 角度 → 中文方位词（正北 0°，顺时针） */
export function bearingLabel(bearing) {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const idx = Math.round(((bearing % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

/** 由两个平面点求方位角（x 向东、y 向北，单位随意，方向一致即可） */
function heading(from, to) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return (a * 180) / Math.PI;
}

/**
 * 推导路口转向提示：由「进入路口的最后一段」与「离开路口的第一段」向量叉积判断左右。
 * 注意：基于示意折线推导，仅作提示，上线前须用实测道路复核。
 */
function turnHint(graph, prevId, junctionId, nextId) {
  const inPts = graph.legGeometry(prevId, junctionId);
  const outPts = graph.legGeometry(junctionId, nextId);
  if (inPts.length < 2 || outPts.length < 2) return null;
  const inVec = [inPts[inPts.length - 1][0] - inPts[inPts.length - 2][0], inPts[inPts.length - 1][1] - inPts[inPts.length - 2][1]];
  const outVec = [outPts[1][0] - outPts[0][0], outPts[1][1] - outPts[0][1]];
  const hIn = heading([0, 0], inVec);
  const hOut = heading([0, 0], outVec);
  const cross = inVec[0] * outVec[1] - inVec[1] * outVec[0];
  const dot = inVec[0] * outVec[0] + inVec[1] * outVec[1];
  const delta = Math.abs(((hOut - hIn + 540) % 360) - 180); // 0 = 直行, 180 = 掉头
  let action = '直行';
  if (delta > 150) action = '掉头';
  else if (delta > 35) action = cross > 0 ? '左转' : '右转';
  return { action, departBearing: Number(((hOut + 360) % 360).toFixed(0)), departLabel: bearingLabel(hOut), deltaDeg: Number(delta.toFixed(0)), cross };
}

/**
 * 规划路线。
 * @param {object} opts
 * @param {Array}  opts.nodes      节点数组
 * @param {Array}  opts.roads      道路数组
 * @param {string} opts.startId    起点 node_id
 * @param {string[]} opts.sightIds 目标景点（1–5 个，含可选的终点）
 * @param {string} [opts.endId]    终点；缺省为「最后加入的景点」
 * @param {string} [opts.intensity] easy | medium | ride
 * @param {string} [opts.period]    all | morning | afternoon
 * @param {number} [opts.altCount]  返回的候选路线条数，默认 3
 */
export function planRoute({ nodes, roads, startId, sightIds, endId, intensity = 'medium', period = 'all', altCount = 3 }) {
  const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));
  const graph = buildGraph(nodes, roads);
  const speed = INTENSITY[intensity] ?? INTENSITY.medium;
  const timeBudget = PERIOD[period] ?? PERIOD.all;
  const warnings = [];

  // ---------- 输入校验（绝不信任客户端数据） ----------
  if (!nodeMap.has(startId)) return { ok: false, code: 'BAD_START', message: '起点不存在，请重新选择。' };
  const uniqueSights = [...new Set(sightIds ?? [])].filter((id) => nodeMap.has(id));
  if (!uniqueSights.length) return { ok: false, code: 'NO_SIGHT', message: '请至少选择 1 个想去的景点。' };
  if (uniqueSights.length > 5) return { ok: false, code: 'TOO_MANY', message: '最多选择 5 个景点。' };

  // 起点若本身是景点，则起点即首个景点，不重复计入中间节点
  const sights = uniqueSights.filter((id) => id !== startId);
  if (!sights.length) {
    // 只选了起点本身这一个景点
    return {
      ok: true, degenerate: true, start: startId, end: startId, speed, timeBudget,
      recommended: { order: [startId], fullPath: [startId], legs: [], total_m: 0, walk_min: 0, visit_min: nodeMap.get(startId)?.duration_min ?? 0, total_min: nodeMap.get(startId)?.duration_min ?? 0, stops: [], geometry: [] },
      original: { order: [startId], total_m: 0, walk_min: 0 },
      saved_m: 0, saved_pct: 0, alternatives: [], warnings: [], message: '起点即所选景点，无需步行。',
    };
  }

  const resolvedEnd = endId && nodeMap.has(endId) ? endId : sights[sights.length - 1];
  const middle = sights.filter((id) => id !== resolvedEnd);
  if (middle.length > 4) warnings.push('中间景点超过 4 个，排列数增长较快，但当前规模仍可毫秒级完成。');

  // ---------- 可达性检查 ----------
  const unreachable = [];
  for (const id of [resolvedEnd, ...middle]) {
    if (!Number.isFinite(graph.distance(startId, id))) unreachable.push(id);
  }

  // ---------- 穷举所有排列并排序 ----------
  const perms = permutations(middle);
  const ranked = [];
  const unreachableInPerm = new Set();
  for (const perm of perms) {
    const order = [startId, ...perm, resolvedEnd];
    const res = orderDistance(graph, order);
    if (!res.reachable) { res.unreachable.forEach((id) => unreachableInPerm.add(id)); continue; }
    ranked.push({ order, total: res.total });
  }
  ranked.sort((a, b) => a.total - b.total || a.order.slice(1, -1).join().localeCompare(b.order.slice(1, -1).join()));

  if (!ranked.length) {
    const bad = [...new Set([...unreachable, ...unreachableInPerm])];
    return {
      ok: false, code: 'NO_ROUTE', graph, speed, timeBudget,
      unreachable: bad.map((id) => ({ node_id: id, name: nodeMap.get(id)?.name ?? id })),
      message: `以下地点无法通过已录入的步行道路到达，请修改选择：${bad.map((id) => nodeMap.get(id)?.name ?? id).join('、')}`,
    };
  }

  // ---------- 原路线（按加入顺序，终点固定为最后一个） ----------
  const originalOrder = [startId, ...middle, resolvedEnd];
  const originalRes = orderDistance(graph, originalOrder);
  const originalTotal = Number.isFinite(originalRes.total) ? originalRes.total : originalRes.total;

  /**
   * 把「起终点 + 景点访问顺序」展开为逐步节点序列（含途经路口），
   * 再按相邻节点对生成行程段 —— 与 PRD 示例格式「起点→路口A→景点1→路口B→景点2→终点」一致。
   */
  const buildPlan = (order, total) => {
    // 1) 展开完整节点序列
    const fullPath = [order[0]];
    for (let i = 0; i < order.length - 1; i += 1) {
      const seg = graph.path(order[i], order[i + 1]) ?? [order[i], order[i + 1]];
      for (let k = 1; k < seg.length; k += 1) {
        if (fullPath[fullPath.length - 1] !== seg[k]) fullPath.push(seg[k]);
      }
    }

    // 2) 逐步生成行程段
    const legs = [];
    let visitMin = 0;
    const stops = [];

    // 起点若本身是景点，同样计入停留
    if (nodeMap.get(fullPath[0])?.type === 'poi') {
      const dur = nodeMap.get(fullPath[0]).duration_min ?? 0;
      visitMin += dur;
      stops.push({ node_id: fullPath[0], name: nodeMap.get(fullPath[0]).name, seq: stops.length + 1, duration_min: dur, arrive_leg_index: -1, is_start: true });
    }

    for (let i = 0; i < fullPath.length - 1; i += 1) {
      const from = fullPath[i];
      const to = fullPath[i + 1];
      const d = graph.distance(from, to);
      const nextNode = fullPath[i + 2];
      const leg = {
        index: i,
        from,
        to,
        from_name: nodeMap.get(from)?.name,
        to_name: nodeMap.get(to)?.name,
        distance_m: d,
        walk_min: d / speed.speedMpm,
        geometry: graph.legGeometry(from, to),
        to_type: nodeMap.get(to)?.type,
        to_duration_min: nodeMap.get(to)?.duration_min ?? 0,
      };
      if (leg.to_type === 'junction' && nextNode) {
        leg.turn = turnHint(graph, from, to, nextNode);
        leg.hint = leg.turn
          ? `在「${leg.to_name}」${leg.turn.action}，朝${leg.turn.departLabel}方向前往「${nodeMap.get(nextNode)?.name}」`
          : `在「${leg.to_name}」继续前往「${nodeMap.get(nextNode)?.name}」`;
      } else if (nextNode) {
        leg.hint = `继续前往「${nodeMap.get(nextNode)?.name}」`;
      } else {
        leg.hint = '本次路线的终点';
      }
      if (leg.to_type === 'poi') {
        visitMin += leg.to_duration_min;
        stops.push({ node_id: to, name: leg.to_name, seq: stops.length + 1, duration_min: leg.to_duration_min, arrive_leg_index: i });
      }
      legs.push(leg);
    }

    const walkMin = total / speed.speedMpm;
    const seenPts = [];
    for (const l of legs) {
      for (const p of l.geometry) {
        const last = seenPts[seenPts.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) seenPts.push(p);
      }
    }
    return {
      order,
      fullPath,
      legs,
      stops,
      total_m: Math.round(total),
      walk_min: Math.round(walkMin),
      visit_min: Math.round(visitMin),
      total_min: Math.round(walkMin + visitMin),
      geometry: seenPts,
    };
  };

  const best = buildPlan(ranked[0].order, ranked[0].total);
  const originalPlan = buildPlan(originalOrder, originalTotal);
  const savedM = Math.max(0, Math.round(originalTotal - ranked[0].total));
  const savedPct = originalTotal > 0 ? (savedM / originalTotal) * 100 : 0;

  // ---------- 候选路线（“分别列出最优的旅游路线”） ----------
  const seenSig = new Set([ranked[0].order.join('>')]);
  const alternatives = [];
  for (const r of ranked) {
    if (alternatives.length >= Math.max(0, altCount - 1)) break;
    const sig = r.order.join('>');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    alternatives.push(buildPlan(r.order, r.total));
  }

  // ---------- 边界提示 ----------
  let message = '';
  if (savedM === 0) message = '当前顺序已较顺路，无需调整。';
  else message = `已为你重排中间景点顺序，相比原路线少走 ${savedM} 米。`;

  if (best.total_min > timeBudget.budgetMin) {
    warnings.push(`按「${timeBudget.label}（${timeBudget.hint}）」安排，含景点停留共需约 ${best.total_min} 分钟，超出该时段可用时长（约 ${timeBudget.budgetMin} 分钟），建议减少景点或改用更长时段。`);
  }
  if (speed.key === 'ride' && best.order.some((id) => nodeMap.get(id)?.type === 'poi')) {
    warnings.push('骑行速度按 12 km/h 估算，景区内部步道可能限制骑行，请以现场标识为准。');
  }
  warnings.push('距离基于已录入的示意道路数据，非实测导航距离；步行时间不含景点停留。');

  return {
    ok: true,
    graph,
    start: startId,
    end: resolvedEnd,
    start_name: nodeMap.get(startId)?.name,
    end_name: nodeMap.get(resolvedEnd)?.name,
    middle,
    middle_names: middle.map((id) => nodeMap.get(id)?.name),
    permCount: perms.length,
    speed,
    timeBudget,
    recommended: best,
    original: {
      order: originalOrder,
      total_m: Math.round(originalTotal),
      walk_min: Math.round(originalTotal / speed.speedMpm),
    },
    /** 原路线的完整详情（含逐段几何），供「原路线 / 推荐路线」对比切换使用 */
    original_plan: originalPlan,
    saved_m: savedM,
    saved_pct: Number(savedPct.toFixed(2)),
    alternatives,
    warnings,
    unreachable: unreachable.map((id) => ({ node_id: id, name: nodeMap.get(id)?.name ?? id })),
    message,
  };
}

/** 把路线计划转成 PRD 要求的纯文字路线（地图失败时也可读） */
export function planToText(plan, nodeMap) {
  if (!plan?.ok) return plan?.message ?? '无法生成路线。';
  const L = [];
  L.push('【推荐路线】');
  L.push(`起点：${plan.start_name}`);
  const planStops = plan.recommended.stops ?? [];
  const startStop = planStops.find((s) => s.is_start);
  if (startStop) L.push(`（起点即景点，建议游览 ${startStop.duration_min} 分钟）`);
  for (const leg of plan.recommended.legs) {
    L.push(`↓ 步行 ${Math.round(leg.distance_m)}m（约 ${Math.max(1, Math.round(leg.walk_min))} 分钟）`);
    const stop = planStops.find((s) => !s.is_start && s.arrive_leg_index === leg.index);
    if (stop) {
      L.push(`${stop.seq}. ${leg.to_name}（建议游览 ${stop.duration_min} 分钟）`);
    } else if (leg.to_type === 'junction') {
      L.push(`路口：${leg.to_name}`);
    } else {
      L.push(`${leg.to_name}${leg.to_type === 'entry' ? '（终点）' : ''}`);
    }
    if (leg.turn) L.push(`   ↳ ${leg.hint}`);
  }
  L.push(`总步行距离：${plan.recommended.total_m}m`);
  L.push(`预计纯步行时间：${plan.recommended.walk_min} 分钟（不含景点停留）`);
  if (plan.recommended.visit_min) L.push(`景点建议停留合计：${plan.recommended.visit_min} 分钟，含停留共约 ${plan.recommended.total_min} 分钟`);
  L.push(`原路线距离：${plan.original.total_m}m`);
  L.push(`节省距离：${plan.saved_m}m（${plan.saved_pct}%）`);
  return L.join('\n');
}
