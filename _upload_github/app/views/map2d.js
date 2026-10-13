/**
 * 2D SVG 平面图（零依赖）。
 * 职责：把道路折线与节点画成可点击的平面示意图，并叠加推荐路线。
 * 同时作为 3D 沙盘加载失败时的兜底地图 —— 满足 PRD「地图加载失败时保留景点列表与路线文字顺序」。
 */
const PAD = 46;
const VB_W = 1000;

const TYPE_STYLE = {
  entry:    { fill: '#0F2E5C', ring: '#8FB4DC', r: 11 },
  junction: { fill: '#2C5C93', ring: '#A9C6E4', r: 9 },
  poi:      { fill: '#1A3C6E', ring: '#E0B863', r: 13 },
};

export function createMap2D(container, opts = {}) {
  const { nodes, roads, onPick } = opts;
  const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));

  const xs = nodes.map((n) => n.x_m);
  const ys = nodes.map((n) => n.y_m);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  // 与 3D 沙盘保持同一范围（862.6 × 834.9 m），四周留白
  const W = Math.max(spanX * 1.18, 862.6);
  const H = Math.max(spanY * 1.18, 834.9);
  const scale = (VB_W - PAD * 2) / W;
  const vbH = Math.round(H * scale + PAD * 2);

  const toXY = (x, y) => [PAD + (x + W / 2) * scale, PAD + (H / 2 - y) * scale];
  const pathD = (pts) => pts.map((p, i) => {
    const [sx, sy] = toXY(p[0], p[1]);
    return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
  }).join(' ');

  const root = document.createElement('div');
  root.className = 'map2d';
  container.appendChild(root);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${vbH}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '东湖听涛景区平面示意图');
  root.appendChild(svg);

  const mk = (tag, attrs = {}) => {
    const el = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  const defs = mk('defs');
  defs.innerHTML = `
    <linearGradient id="m2d-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F4F8FC"/><stop offset="1" stop-color="#E6EFF8"/>
    </linearGradient>
    <marker id="m2d-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#C8102E"/>
    </marker>
  `;
  svg.appendChild(defs);

  svg.appendChild(mk('rect', { x: 0, y: 0, width: VB_W, height: vbH, fill: 'url(#m2d-bg)' }));

  // 路网
  const roadLayer = mk('g', { 'aria-label': '可步行道路' });
  svg.appendChild(roadLayer);
  for (const r of roads) {
    const pts = (r.polyline ?? []).length >= 2 ? r.polyline : [[nodeMap.get(r.from_node)?.x_m, nodeMap.get(r.from_node)?.y_m], [nodeMap.get(r.to_node)?.x_m, nodeMap.get(r.to_node)?.y_m]];
    roadLayer.appendChild(mk('path', {
      d: pathD(pts),
      fill: 'none',
      stroke: '#B9C7D6',
      'stroke-width': (r.width_m ?? 3) >= 3 ? 5 : 3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }));
  }

  // 路线层
  const routeLayer = mk('g', { 'aria-label': '推荐路线' });
  svg.appendChild(routeLayer);

  // 节点层
  const nodeLayer = mk('g', { 'aria-label': '景点与路口' });
  svg.appendChild(nodeLayer);
  const nodeEls = new Map();

  for (const n of nodes) {
    const st = TYPE_STYLE[n.type] ?? TYPE_STYLE.poi;
    const [cx, cy] = toXY(n.x_m, n.y_m);
    const g = mk('g', { class: 'm2d-node', tabindex: '0', role: 'button' });
    g.setAttribute('aria-label', `${n.name}（${n.type === 'poi' ? '景点' : n.type === 'entry' ? '入口' : '路口'}）`);
    g.appendChild(mk('circle', { cx, cy, r: st.r + 7, fill: '#ffffff', 'fill-opacity': '.92' }));
    g.appendChild(mk('circle', { cx, cy, r: st.r, fill: st.fill, stroke: st.ring, 'stroke-width': 2.5 }));
    if (n.type === 'poi') {
      g.appendChild(mk('circle', { cx, cy, r: st.r - 5, fill: '#E0B863' }));
    } else if (n.type === 'entry') {
      g.appendChild(mk('rect', { x: cx - 5, y: cy - 5, width: 10, height: 10, fill: '#ffffff', rx: 2 }));
    } else {
      g.appendChild(mk('path', { d: `M${cx - 5} ${cy} L${cx} ${cy - 5} L${cx + 5} ${cy} L${cx} ${cy + 5} Z`, fill: '#ffffff' }));
    }
    const label = n.type === 'poi' || n.type === 'entry' ? n.name : `${n.name}`;
    const txt = mk('text', {
      x: cx + st.r + 8,
      y: cy + 4,
      'font-size': n.type === 'poi' ? 17 : 15,
      'font-family': "'Microsoft YaHei','PingFang SC',sans-serif",
      fill: '#20334C',
      'font-weight': n.type === 'poi' ? 700 : 500,
    });
    txt.textContent = label;
    g.appendChild(txt);
    // 点击热区
    g.addEventListener('click', () => onPick?.(n.node_id));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(n.node_id); } });
    nodeLayer.appendChild(g);
    nodeEls.set(n.node_id, g);
  }

  let currentRoute = mk('g');
  routeLayer.appendChild(currentRoute);

  /** 更新路线叠加层 */
  function setRoute(route) {
    routeLayer.removeChild(currentRoute);
    currentRoute = mk('g');
    routeLayer.appendChild(currentRoute);
    if (!route?.geometry?.length) return;

    currentRoute.appendChild(mk('path', {
      d: pathD(route.geometry),
      fill: 'none',
      stroke: '#C8102E',
      'stroke-width': 6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': '14 8',
      'marker-end': 'url(#m2d-arrow)',
      'marker-mid': 'url(#m2d-arrow)',
      opacity: '.95',
    }));
    currentRoute.appendChild(mk('path', {
      d: pathD(route.geometry),
      fill: 'none',
      stroke: '#ffffff',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      opacity: '.7',
    }));

    for (const leg of route.legs ?? []) {
      if (!leg.geometry?.length) continue;
      const mid = leg.geometry[Math.floor(leg.geometry.length / 2)];
      const [mx, my] = toXY(mid[0], mid[1]);
      const mark = mk('path', {
        d: `M${mx} ${my - 9} L${mx + 8} ${my} L${mx} ${my + 9} L${mx - 8} ${my} Z`,
        fill: '#C8102E', stroke: '#ffffff', 'stroke-width': 1.5,
      });
      currentRoute.appendChild(mark);
    }

    for (const stop of route.stops ?? []) {
      const n = nodeMap.get(stop.node_id);
      if (!n) continue;
      const [sx, sy] = toXY(n.x_m, n.y_m);
      const badge = mk('g');
      badge.appendChild(mk('circle', { cx: sx, cy: sy - 26, r: 13, fill: '#C8102E', stroke: '#ffffff', 'stroke-width': 3 }));
      const t = mk('text', {
        x: sx, y: sy - 21, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#ffffff',
        'font-family': "'Microsoft YaHei','PingFang SC',sans-serif",
      });
      t.textContent = String(stop.seq);
      badge.appendChild(t);
      currentRoute.appendChild(badge);
    }
  }

  /** 高亮某个节点 */
  function highlight(nodeId) {
    for (const [id, el] of nodeEls) {
      el.classList.toggle('is-active', id === nodeId);
    }
  }

  function destroy() {
    root.remove();
  }

  return { root, svg, setRoute, highlight, destroy, toXY };
}
