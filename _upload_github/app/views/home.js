/** 首页 / 地图页：景点列表 + 地图标记 + 路线入口（PRD 4.1） */
import { h, esc, fmtMinutes, toast, guard, $ } from '../ui/dom.js';

export function createHomeView(app) {
  const root = h(`
    <div class="view view--home">
      <div class="map-host" id="home-map-host"></div>
      <section class="panel">
        <h2 class="panel__title">听涛景区 · 概览</h2>
        <div class="stat-row" id="home-stats"></div>
      </section>
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">景点列表</h2>
          <span class="panel__hint" id="home-sel-hint"></span>
        </div>
        <div class="card-list" id="home-sights"></div>
      </section>
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">出入口与关键路口</h2>
          <span class="panel__hint">点击查看通往哪些景点</span>
        </div>
        <div class="card-list card-list--compact" id="home-nodes"></div>
      </section>
    </div>
  `);

  const statsEl = $('#home-stats', root);
  const sightsEl = $('#home-sights', root);
  const nodesEl = $('#home-nodes', root);
  const hintEl = $('#home-sel-hint', root);

  function state() {
    return {
      stats: app.state.stats,
      selections: app.state.route.sightIds,
      likes: app.state.myLikes,
    };
  }

  function renderStats() {
    const pois = app.state.nodes.filter((n) => n.type === 'poi');
    const junctions = app.state.nodes.filter((n) => n.type === 'junction');
    const entries = app.state.nodes.filter((n) => n.type === 'entry');
    const totalM = app.state.roads.reduce((s, r) => s + Number(r.length_m || 0), 0);
    statsEl.innerHTML = [
      ['景点', pois.length, '个'],
      ['路口', junctions.length, '个'],
      ['出入口', entries.length, '个'],
      ['可步行道路', app.state.roads.length, '条'],
      ['道路总里程', (totalM / 1000).toFixed(2), 'km'],
    ].map(([label, value, unit]) => `
      <div class="stat">
        <span class="stat__value">${esc(value)}<i>${esc(unit)}</i></span>
        <span class="stat__label">${esc(label)}</span>
      </div>`).join('');
  }

  function renderSights() {
    const { stats, selections, likes } = state();
    const pois = app.state.nodes.filter((n) => n.type === 'poi');
    if (hintEl) hintEl.textContent = selections.length ? `已加入 ${selections.length} 个景点` : '点「加入路线」可排行程';
    sightsEl.innerHTML = '';
    for (const n of pois) {
      const st = stats[n.node_id] ?? { like_count: 0, comment_count: 0 };
      const seq = selections.indexOf(n.node_id);
      const liked = likes.has(n.node_id);
      const card = h(`
        <article class="card" data-id="${esc(n.node_id)}">
          <button class="card__media" data-act="open" aria-label="查看 ${esc(n.name)}">
            <img src="${esc(n.cover_img)}" alt="${esc(n.name)} 封面" loading="lazy" decoding="async">
            <span class="card__tag">${esc(n.kind_label ?? '景点')}</span>
            <span class="card__cover-note">示意图</span>
          </button>
          <div class="card__body">
            <div class="card__head">
              <h3 class="card__title" data-act="open">${esc(n.name)}</h3>
              <span class="card__meta">建议游览 ${fmtMinutes(n.duration_min)}</span>
            </div>
            <p class="card__desc">${esc(n.desc)}</p>
            <div class="card__foot">
              <span class="metrics">
                <span class="metric" title="点赞数">♥ ${st.like_count}</span>
                <span class="metric" title="评论数">💬 ${st.comment_count}</span>
              </span>
              <button class="btn btn--sm ${seq >= 0 ? 'btn--on' : 'btn--primary'}" data-act="toggle-route">
                ${seq >= 0 ? `已加入 · 第 ${seq + 1} 站` : '加入路线'}
              </button>
            </div>
          </div>
        </article>
      `);
      card.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'open') { app.navigate(`#/sight/${n.node_id}`); return; }
        if (act === 'toggle-route') { app.toggleSight(n.node_id); renderSights(); }
      });
      if (liked) card.querySelector('.card__foot')?.classList.add('is-liked');
      sightsEl.appendChild(card);
    }
  }

  function renderNodes() {
    nodesEl.innerHTML = '';
    const list = app.state.nodes.filter((n) => n.type !== 'poi').sort((a, b) => a.sort_order - b.sort_order);
    for (const n of list) {
      const connects = app.connectsOf(n.node_id);
      const row = h(`
        <div class="row" data-id="${esc(n.node_id)}" role="button" tabindex="0">
          <span class="dot dot--${esc(n.type)}"></span>
          <span class="row__name">${esc(n.name)}</span>
          <span class="row__meta">${esc(n.kind_label ?? '')}</span>
          <span class="row__tail">${connects.length ? `通往 ${connects.map((c) => esc(c.name)).join('、')}` : '—'}</span>
          <span class="row__arrow">›</span>
        </div>
      `);
      const open = () => { app.navigate(`#/sight/${n.node_id}`); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      nodesEl.appendChild(row);
    }
  }

  return {
    root,
    render() {
      renderStats();
      renderSights();
      renderNodes();
      app.mountMap(root.querySelector('#home-map-host'));
    },
    onStatsChanged() { renderSights(); },
  };
}
