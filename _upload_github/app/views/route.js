/** 路线页：起点/景点选择、穷举法优化、路线可视化与距离对比（PRD 4.3 / 3.5） */
import { h, esc, fmtDistance, fmtMinutes, toast, $ } from '../ui/dom.js';
import { INTENSITY, PERIOD } from '../core/graph.js';
import { planToText } from '../core/route.js';

const INTENSITY_ORDER = ['easy', 'medium', 'ride'];
const PERIOD_ORDER = ['all', 'morning', 'afternoon'];

export function createRouteView(app) {
  const root = h(`
    <div class="view view--route">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">选择你的行程</h2>
          <span class="panel__hint">最多 5 个景点</span>
        </div>

        <div class="field">
          <label>起点</label>
          <div class="opt-grid" data-group="start"></div>
        </div>

        <div class="field">
          <label>想去的景点 <span class="field__note">按加入顺序即为「原路线」，可再点一次移除</span></label>
          <div class="opt-grid" data-group="sights"></div>
        </div>

        <div class="field">
          <label>终点 <span class="field__note">默认最后加入的景点</span></label>
          <div class="opt-grid opt-grid--tight" data-group="end"></div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>游玩时间</label>
            <div class="seg seg--sm" data-group="period"></div>
          </div>
          <div class="field">
            <label>游玩强度</label>
            <div class="seg seg--sm" data-group="intensity"></div>
          </div>
        </div>

        <div class="route-actions">
          <button class="btn btn--primary btn--block" data-act="optimize">优化路线</button>
          <button class="btn btn--ghost" data-act="reset">清空</button>
        </div>
      </section>

      <div class="map-host" id="route-map-host"></div>

      <div data-slot="result"></div>
    </div>
  `);

  let displayIndex = 0;        // 0 = 最优；1..n = 候选
  let compareMode = 'recommended';

  const state = () => app.state.route;

  // ---------------- 选择区渲染 ----------------
  function renderControls() {
    const s = state();

    // 起点：出入口 + 景点都可作为起点
    const startGrid = $('[data-group="start"]', root);
    const startOptions = app.state.nodes.filter((n) => n.type === 'entry' || n.type === 'poi').sort((a, b) => a.sort_order - b.sort_order);
    startGrid.innerHTML = startOptions.map((n) => `
      <button class="opt ${s.startId === n.node_id ? 'is-on' : ''}" data-val="${esc(n.node_id)}">
        <span class="opt__name">${esc(n.name)}</span>
        <span class="opt__meta">${esc(n.kind_label ?? '')}</span>
      </button>`).join('');

    // 景点多选：显示加入序号
    const sightsGrid = $('[data-group="sights"]', root);
    const pois = app.state.nodes.filter((n) => n.type === 'poi').sort((a, b) => a.sort_order - b.sort_order);
    sightsGrid.innerHTML = pois.map((n) => {
      const idx = s.sightIds.indexOf(n.node_id);
      const isStart = s.startId === n.node_id;
      return `
      <button class="opt opt--multi ${idx >= 0 ? 'is-on' : ''} ${isStart ? 'is-start' : ''}" data-val="${esc(n.node_id)}">
        ${idx >= 0 ? `<span class="opt__badge">${idx + 1}</span>` : ''}
        <span class="opt__name">${esc(n.name)}</span>
        <span class="opt__meta">${esc(fmtMinutes(n.duration_min))}${isStart ? ' · 起点' : ''}</span>
      </button>`;
    }).join('');

    // 终点：景点 + 出入口
    const endGrid = $('[data-group="end"]', root);
    const endOptions = app.state.nodes.filter((n) => n.type === 'entry' || n.type === 'poi').sort((a, b) => a.sort_order - b.sort_order);
    endGrid.innerHTML = endOptions.map((n) => `
      <button class="opt opt--sm ${s.endId === n.node_id ? 'is-on' : ''}" data-val="${esc(n.node_id)}">${esc(n.name)}</button>`).join('');

    // 时段
    const periodSeg = $('[data-group="period"]', root);
    periodSeg.innerHTML = PERIOD_ORDER.map((k) => `
      <button class="seg__btn ${s.period === k ? 'is-on' : ''}" data-val="${k}">${esc(PERIOD[k].label)}</button>`).join('');

    // 强度
    const intensitySeg = $('[data-group="intensity"]', root);
    intensitySeg.innerHTML = INTENSITY_ORDER.map((k) => `
      <button class="seg__btn ${s.intensity === k ? 'is-on' : ''}" data-val="${k}">${esc(INTENSITY[k].label)}</button>`).join('');

    root.querySelector('[data-act="reset"]').hidden = !s.sightIds.length;
  }

  function renderResult() {
    const slot = $('[data-slot="result"]', root);
    const s = state();
    const plan = app.state.plan;

    if (!plan) {
      slot.innerHTML = `
        <section class="panel">
          <p class="empty">选择起点和 1–5 个景点后，这里会自动生成推荐路线与距离对比。</p>
        </section>`;
      return;
    }

    if (plan.ok === false) {
      slot.innerHTML = `
        <section class="panel">
          <p class="notice notice--warn">${esc(plan.message)}</p>
          ${plan.unreachable?.length ? `<ul class="plain-list">${plan.unreachable.map((u) => `<li>${esc(u.name)}</li>`).join('')}</ul>` : ''}
          <p class="empty">建议改用其他景点，或选择其他起点。</p>
        </section>`;
      return;
    }

    const active = compareMode === 'original'
      ? (plan.original_plan ?? plan.recommended)
      : (displayIndex === 0 ? plan.recommended : plan.alternatives[displayIndex - 1] ?? plan.recommended);

    const isBest = compareMode === 'recommended' && displayIndex === 0;
    const saving = Math.max(0, plan.original.total_m - active.total_m);
    const savingPct = plan.original.total_m ? (saving / plan.original.total_m) * 100 : 0;

    slot.innerHTML = `
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">路线概览</h2>
          <div class="seg seg--sm" data-group="compare">
            <button class="seg__btn ${compareMode === 'recommended' ? 'is-on' : ''}" data-val="recommended">推荐路线</button>
            <button class="seg__btn ${compareMode === 'original' ? 'is-on' : ''}" data-val="original">原路线</button>
          </div>
        </div>

        <div class="metric-grid">
          <div class="metric-card metric-card--key">
            <span class="metric-card__value">${fmtDistance(active.total_m)}</span>
            <span class="metric-card__label">总步行距离</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">${fmtMinutes(active.walk_min)}</span>
            <span class="metric-card__label">纯步行时间<i>不含停留</i></span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">${fmtMinutes(active.visit_min)}</span>
            <span class="metric-card__label">景点建议停留</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">${fmtMinutes(active.total_min)}</span>
            <span class="metric-card__label">含停留合计</span>
          </div>
          <div class="metric-card ${saving > 0 ? 'metric-card--good' : ''}">
            <span class="metric-card__value">${saving > 0 ? `−${fmtDistance(saving)}` : '持平'}</span>
            <span class="metric-card__label">相比原路线${saving > 0 ? `<i>省 ${savingPct.toFixed(1)}%</i>` : ''}</span>
          </div>
          <div class="metric-card">
            <span class="metric-card__value">${plan.permCount * 1}</span>
            <span class="metric-card__label">穷举排列数<i>3! 级，毫秒完成</i></span>
          </div>
        </div>

        <p class="notice notice--info">
          ${esc(plan.message)}${isBest ? '' : '（当前展示的是备选方案）'}
        </p>

        <div class="order-line">
          <span class="order-line__label">原路线</span>
          <span class="order-line__seq">${esc(plan.original.order.map((id) => app.nameOf(id)).join(' → '))}</span>
        </div>
        <div class="order-line order-line--key">
          <span class="order-line__label">推荐顺序</span>
          <span class="order-line__seq">${esc(plan.recommended.order.map((id) => app.nameOf(id)).join(' → '))}</span>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">游览顺序与路口提示</h2>
        <ol class="timeline" data-slot="timeline"></ol>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">文字路线</h2>
          <span class="panel__hint">地图之外也可照着走</span>
        </div>
        <pre class="text-route" data-slot="text-route"></pre>
      </section>

      ${plan.alternatives?.length ? `
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">其他可达方案</h2>
          <span class="panel__hint">穷举法已排完全部顺序</span>
        </div>
        <div class="alt-list" data-slot="alts"></div>
      </section>` : ''}

      ${plan.warnings?.length ? `
      <section class="panel">
        <h2 class="panel__title">出行提示</h2>
        <ul class="plain-list">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
      </section>` : ''}
    `;

    // 对比切换
    $('[data-group="compare"]', slot).addEventListener('click', (e) => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      compareMode = b.dataset.val;
      app.setRouteOverlay(compareMode === 'original' ? (plan.original_plan ?? plan.recommended) : (displayIndex === 0 ? plan.recommended : plan.alternatives[displayIndex - 1] ?? plan.recommended));
      renderResult();
    });

    // 时间轴
    const nodeMap = app.state.nodeMap;
    const tl = $('[data-slot="timeline"]', slot);
    const stops = active.stops ?? [];
    for (const leg of active.legs ?? []) {
      const stop = stops.find((x) => x.arrive_leg_index === leg.index);
      const li = h(`
        <li class="timeline__item ${leg.to_type === 'poi' ? 'is-poi' : leg.to_type === 'junction' ? 'is-junction' : 'is-entry'}">
          <span class="timeline__dot"></span>
          <div class="timeline__body">
            <div class="timeline__head">
              <span class="timeline__name">${stop ? `<b class="timeline__seq">${stop.seq}</b> ` : ''}${esc(leg.to_name)}</span>
              <span class="timeline__meta">
                ${leg.to_type === 'poi' ? `建议游览 ${fmtMinutes(leg.to_duration_min)}` : esc(nodeMap.get(leg.to)?.kind_label ?? '')}
              </span>
            </div>
            <div class="timeline__leg">步行 ${fmtDistance(leg.distance_m)} · 约 ${Math.max(1, Math.round(leg.walk_min))} 分钟</div>
            ${leg.turn ? `<div class="timeline__hint">↳ ${esc(leg.hint)}</div>` : ''}
          </div>
        </li>`);
      tl.appendChild(li);
    }

    $('[data-slot="text-route"]', slot).textContent = planToText({ ...plan, recommended: active, start_name: app.nameOf(active.order[0]), end_name: app.nameOf(active.order.at(-1)) }, nodeMap);

    // 候选方案
    const altsEl = $('[data-slot="alts"]', slot);
    if (altsEl) {
      altsEl.innerHTML = '';
      const all = [plan.recommended, ...plan.alternatives];
      all.forEach((p, i) => {
        if (i === 0) return;
        const diff = p.total_m - plan.recommended.total_m;
        const btn = h(`
          <button class="alt ${displayIndex === i ? 'is-on' : ''}">
            <span class="alt__order">${esc(p.order.map((id) => app.nameOf(id)).join(' → '))}</span>
            <span class="alt__meta">${fmtDistance(p.total_m)} · 纯步行 ${fmtMinutes(p.walk_min)}${diff > 0 ? ` · 多走 ${fmtDistance(diff)}` : ''}</span>
          </button>`);
        btn.addEventListener('click', () => {
          displayIndex = i;
          compareMode = 'recommended';
          const target = displayIndex === 0 ? plan.recommended : plan.alternatives[displayIndex - 1];
          app.setRouteOverlay(target);
          renderResult();
        });
        altsEl.appendChild(btn);
      });
    }
  }

  // ---------------- 事件绑定 ----------------
  root.addEventListener('click', (e) => {
    const segBtn = e.target.closest('.seg__btn[data-val]');
    if (segBtn) {
      const group = segBtn.closest('[data-group]')?.dataset.group;
      if (group === 'period') { state().period = segBtn.dataset.val; }
      if (group === 'intensity') { state().intensity = segBtn.dataset.val; }
      if (group === 'period' || group === 'intensity') { renderControls(); compute(); }
      return;
    }

    const opt = e.target.closest('.opt');
    if (opt) {
      const group = opt.parentElement.dataset.group;
      const val = opt.dataset.val;
      if (group === 'start') {
        state().startId = val;
        if (state().sightIds.includes(val)) state().sightIds = state().sightIds.filter((x) => x !== val);
      } else if (group === 'sights') {
        const arr = state().sightIds;
        const i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1);
        else if (arr.length >= 5) { toast('最多选择 5 个景点。', 'warn'); return; }
        else arr.push(val);
        if (!arr.includes(state().endId)) state().endId = arr[arr.length - 1] ?? state().startId;
      } else if (group === 'end') {
        state().endId = val;
      }
      displayIndex = 0;
      compareMode = 'recommended';
      app.persistRouteSelection();
      renderControls();
      compute();
      return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'optimize') {
      displayIndex = 0;
      compareMode = 'recommended';
      compute({ announce: true });
    }
    if (act === 'reset') {
      state().sightIds = [];
      state().endId = state().startId;
      displayIndex = 0;
      app.persistRouteSelection();
      renderControls();
      compute();
    }
  });

  function compute({ announce = false } = {}) {
    const s = state();
    if (!s.sightIds.length) {
      app.state.plan = null;
      app.setRouteOverlay(null);
      renderResult();
      return;
    }
    const t0 = performance.now();
    const plan = app.planRoute({
      startId: s.startId,
      sightIds: s.sightIds,
      endId: s.endId,
      intensity: s.intensity,
      period: s.period,
    });
    plan.elapsedMs = Number((performance.now() - t0).toFixed(2));
    app.state.plan = plan;

    if (plan.ok) {
      app.setRouteOverlay(plan.recommended);
      if (announce) {
        toast(plan.saved_m > 0 ? `已优化：少走 ${fmtDistance(plan.saved_m)}（${plan.saved_pct}%）` : plan.message, plan.saved_m > 0 ? 'ok' : 'info');
      }
    } else {
      app.setRouteOverlay(null);
      if (announce) toast(plan.message, 'warn', 4000);
    }
    renderResult();
  }

  return {
    root,
    render() {
      renderControls();
      compute();
      app.mountMap(root.querySelector('#route-map-host'));
    },
    refresh: () => renderResult(),
  };
}
