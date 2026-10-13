/**
 * 应用入口：初始化数据通道 → 建立共享状态 → 挂载三个视图 → 处理 hash 路由。
 *
 * 说明：为满足 PRD「选择起点和景点后可查看推荐顺序及优化前后的距离」，
 * 路线在选项变化后即时重算（毫秒级），「优化路线」按钮用于重新求解并给出结论提示。
 */
import { createStore, mapError } from './services/api.js';
import { createMapPanel } from './views/mapPanel.js';
import { createHomeView } from './views/home.js';
import { createDetailView } from './views/detail.js';
import { createRouteView } from './views/route.js';
import { buildGraph } from './core/graph.js';
import { planRoute as planRouteCore } from './core/route.js';
import { toast, $ } from './ui/dom.js';

const LS_ROUTE = 'dh:route:v1';

const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式下忽略 */ } };

const app = {
  state: {
    nodes: [],
    roads: [],
    nodeMap: new Map(),
    stats: {},
    myLikes: new Set(),
    connects: new Map(),
    route: { startId: 'entry', sightIds: [], endId: 'entry', intensity: 'medium', period: 'all' },
    plan: null,
    graph: null,
  },
  store: null,
  health: null,
  views: {},
  panel: null,
  mountedPanelIn: null,
  pendingOverlay: null,

  nameOf(id) { return this.state.nodeMap.get(id)?.name ?? id; },

  /** 某节点「直达哪些景点」：最短路径上不夹带其它景点（PRD 3.2 路口指引） */
  connectsOf(nodeId) {
    if (this.state.connects.has(nodeId)) return this.state.connects.get(nodeId);
    const g = this.state.graph;
    const pois = this.state.nodes.filter((n) => n.type === 'poi');
    const out = [];
    for (const p of pois) {
      if (p.node_id === nodeId) continue;
      const path = g?.path(nodeId, p.node_id);
      if (!path) continue;
      const inner = path.slice(1, -1);
      const blocked = inner.some((id) => this.state.nodeMap.get(id)?.type === 'poi' && id !== p.node_id);
      if (!blocked) out.push(p);
    }
    this.state.connects.set(nodeId, out);
    return out;
  },

  mountMap(host) {
    if (!this.panel || !host) return;
    this.mountedPanelIn = host;
    this.panel.mount(host);
    this.applyOverlay();
  },

  setRouteOverlay(plan) {
    this.pendingOverlay = plan;
    this.applyOverlay();
  },

  applyOverlay() {
    if (!this.panel) return;
    const onRouteView = location.hash.startsWith('#/route');
    const plan = onRouteView ? this.pendingOverlay : null;
    this.panel.setRoute(plan && plan.ok !== false ? { geometry: plan.geometry ?? [], legs: plan.legs ?? [], stops: plan.stops ?? [] } : null);
  },

  focusNode(nodeId) {
    this.panel?.highlight(nodeId);
    this.panel?.focus(nodeId);
  },

  toggleSight(nodeId) {
    const arr = this.state.route.sightIds;
    const i = arr.indexOf(nodeId);
    if (i >= 0) arr.splice(i, 1);
    else if (arr.length >= 5) { toast('最多选择 5 个景点。', 'warn'); return; }
    else arr.push(nodeId);
    if (!arr.includes(this.state.route.endId)) this.state.route.endId = arr[arr.length - 1] ?? this.state.route.startId;
    this.persistRouteSelection();
    if (location.hash.startsWith('#/route')) this.views.route.refresh();
  },

  planRoute(opts) {
    return planRouteCore({ nodes: this.state.nodes, roads: this.state.roads, ...opts });
  },

  persistRouteSelection() { writeJSON(LS_ROUTE, this.state.route); },

  async refreshStats() {
    try {
      this.state.stats = await this.store.getStats();
      this.state.myLikes = await this.store.getMyLikes();
      this.views.home?.onStatsChanged?.();
    } catch (err) {
      toast(mapError(err).message, 'error');
    }
  },

  onStatsChanged() { this.views.home?.onStatsChanged?.(); },

  navigate(hash) {
    if (location.hash === hash) { this.route(); return; }
    location.hash = hash;
  },

  route() {
    const hash = location.hash || '#/home';
    const detailMatch = hash.match(/^#\/sight\/(.+)$/);
    const show = (name) => {
      for (const [k, v] of Object.entries(this.views)) { if (v?.root) v.root.hidden = k !== name; }
      if (name !== 'detail' && this.mountedPanelIn && !this.mountedPanelIn.isConnected) this.rebindMapHost(name);
    };

    if (detailMatch) {
      show('detail');
      this.views.detail.render(decodeURIComponent(detailMatch[1]));
      window.scrollTo({ top: 0 });
      return;
    }
    if (hash.startsWith('#/route')) {
      show('route');
      this.views.route.render();
      window.scrollTo({ top: 0 });
      return;
    }
    show('home');
    this.views.home.render();
    window.scrollTo({ top: 0 });
  },

  /** 视图被隐藏后地图容器可能脱离文档，回到该视图时重新挂载 */
  rebindMapHost(viewName) {
    const host = viewName === 'route' ? $('#route-map-host', this.views.route.root) : $('#home-map-host', this.views.home.root);
    if (host) this.mountMap(host);
  },
};

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function boot() {
  const badge = document.getElementById('mode-badge');
  const noticeEl = document.getElementById('notice');

  // 1) 数据通道（createStore 内部保证：云端不可用时回退本地，不会抛错）
  let boot1;
  try {
    boot1 = await createStore();
  } catch (err) {
    if (noticeEl) {
      noticeEl.hidden = false;
      noticeEl.className = 'notice notice--error';
      noticeEl.textContent = `后端初始化失败：${mapError(err).message}`;
    }
    document.getElementById('views').innerHTML =
      `<section class="panel"><p class="notice notice--error">无法初始化数据通道：${mapError(err).message}</p></section>`;
    return;
  }
  app.store = boot1.store;

  if (badge) {
    const isCloud = app.store?.mode === 'cloud';
    badge.textContent = isCloud ? '云端数据 · Supabase' : '本地演示模式';
    badge.className = `badge ${isCloud ? 'badge--cloud' : 'badge--local'}`;
    badge.title = boot1?.health?.detail ?? '';
  }
  if (boot1?.notice && noticeEl) {
    noticeEl.hidden = false;
    noticeEl.className = 'notice notice--warn';
    noticeEl.innerHTML = `<span>${boot1.notice}</span>`;
    const close = document.createElement('button');
    close.className = 'notice__close';
    close.setAttribute('aria-label', '关闭提示');
    close.textContent = '×';
    close.addEventListener('click', () => { noticeEl.hidden = true; });
    noticeEl.appendChild(close);
  }

  // 2) 基础数据 + 路网图
  app.state.nodes = await app.store.getNodes();
  app.state.roads = await app.store.getRoads();
  app.state.nodeMap = new Map(app.state.nodes.map((n) => [n.node_id, n]));
  app.state.graph = buildGraph(app.state.nodes, app.state.roads);

  // 3) 路线选择恢复
  const saved = readJSON(LS_ROUTE, null);
  if (saved && app.state.nodeMap.has(saved.startId)) {
    app.state.route = {
      startId: saved.startId,
      sightIds: (saved.sightIds ?? []).filter((id) => app.state.nodeMap.get(id)?.type === 'poi'),
      endId: app.state.nodeMap.has(saved.endId) ? saved.endId : saved.startId,
      intensity: ['easy', 'medium', 'ride'].includes(saved.intensity) ? saved.intensity : 'medium',
      period: ['all', 'morning', 'afternoon'].includes(saved.period) ? saved.period : 'all',
    };
  }

  // 4) 视图
  app.views.home = createHomeView(app);
  app.views.detail = createDetailView(app);
  app.views.route = createRouteView(app);
  const main = document.getElementById('views');
  for (const v of Object.values(app.views)) { v.root.hidden = true; main.appendChild(v.root); }

  // 5) 地图面板（单一实例，随视图搬家）
  app.panel = createMapPanel({
    nodes: app.state.nodes,
    roads: app.state.roads,
    onPick: (nodeId) => {
      if (!nodeId) return;
      if (location.hash.startsWith('#/route')) {
        toast(`已定位「${app.nameOf(nodeId)}」`, 'info');
        app.panel.highlight(nodeId);
        return;
      }
      app.navigate(`#/sight/${nodeId}`);
    },
  });

  // 6) 统计与点赞
  try {
    app.state.stats = await app.store.getStats();
    app.state.myLikes = await app.store.getMyLikes();
  } catch (err) {
    toast(mapError(err).message, 'error');
  }

  // 7) 路由
  window.addEventListener('hashchange', () => app.route());
  document.querySelector('.tabbar')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (b) app.navigate(b.dataset.nav);
  });
  if (!location.hash) location.hash = '#/home';
  app.route();

  // 8) 首屏渲染完成后再并行升级 3D，避免拖慢首屏
  const start3D = () => app.panel.start3D();
  if ('requestIdleCallback' in window) requestIdleCallback(start3D, { timeout: 1200 });
  else setTimeout(start3D, 350);
}

boot().catch((err) => {
  document.getElementById('views').innerHTML =
    `<section class="panel"><p class="notice notice--error">应用启动失败：${mapError(err).message}</p></section>`;
});
