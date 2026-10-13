/**
 * 地图面板：统一封装「3D 沙盘」与「2D 平面图」两种呈现，并负责降级与重试。
 *
 * 策略（对应 PRD「3 秒内可用」与「地图加载失败时提供重试入口」）：
 *   1. 先立即可视化 2D 平面图 —— 不依赖 WebGL、不等待 4MB 模型，首屏秒开；
 *   2. 后台并行加载 3D 沙盘，成功且用户未手动选择时自动升级为 3D；
 *   3. 3D 失败不阻断任何功能，面板顶部给出原因与「重试」按钮，文字路线始终保留。
 */
import { createMap2D } from './map2d.js';
import { h, $$ } from '../ui/dom.js';

export function createMapPanel({ nodes, roads, onPick }) {
  const root = h(`
    <div class="map-panel">
      <div class="map-panel__bar">
        <div class="seg" role="tablist" aria-label="地图呈现方式">
          <button class="seg__btn" data-mode="3d" role="tab">3D 沙盘</button>
          <button class="seg__btn is-on" data-mode="2d" role="tab">平面图</button>
        </div>
        <div class="map-panel__tools">
          <button class="btn-icon" data-view="iso" title="斜视角">斜视</button>
          <button class="btn-icon" data-view="top" title="俯视角">俯视</button>
          <button class="btn-icon" data-action="reset" title="重置视图">复位</button>
        </div>
      </div>
      <div class="map-panel__stage">
        <div class="map2d-host"></div>
        <div class="map3d-host" hidden></div>
        <div class="map-panel__status" hidden></div>
      </div>
      <p class="map-panel__legend">
        <span class="lg lg--poi">景点</span>
        <span class="lg lg--junction">路口</span>
        <span class="lg lg--entry">出入口</span>
        <span class="lg lg--route">推荐路线</span>
        <span class="map-panel__note">示意沙盘 · 不可用于实地导航</span>
      </p>
    </div>
  `);

  const stage = root.querySelector('.map-panel__stage');
  const host2d = root.querySelector('.map2d-host');
  const host3d = root.querySelector('.map3d-host');
  const statusEl = root.querySelector('.map-panel__status');
  const tools = root.querySelector('.map-panel__tools');

  const map2d = createMap2D(host2d, { nodes, roads, onPick });

  let three = null;          // Map3D 实例
  let threeState = 'idle';   // idle | loading | ready | failed
  let userChose2d = false;
  let pendingRoute = null;
  let pendingHighlight = null;

  const setStatus = (text, kind = 'info', withRetry = false) => {
    if (!text) { statusEl.hidden = true; return; }
    statusEl.hidden = false;
    statusEl.className = `map-panel__status is-${kind}`;
    statusEl.textContent = text;
    if (withRetry) {
      const btn = h('<button class="btn btn--sm btn--ghost" data-action="retry">重试加载 3D</button>');
      btn.addEventListener('click', () => { retry(); });
      statusEl.appendChild(btn);
    }
  };

  /** 切换呈现方式；manual=true 表示用户手动选择，则不再自动升级 */
  function setMode(mode, manual = false) {
    if (manual && mode === '2d') userChose2d = true;
    if (manual && mode === '3d') userChose2d = true;
    const use3d = mode === '3d' && threeState === 'ready';
    host3d.hidden = !use3d;
    host2d.hidden = use3d;
    tools.hidden = !use3d;
    for (const b of $$('.seg__btn', root)) b.classList.toggle('is-on', b.dataset.mode === (use3d ? '3d' : '2d'));
    if (mode === '3d' && threeState !== 'ready') {
      if (threeState === 'loading') setStatus('三维沙盘加载中…（约 4 MB，首次打开稍慢）', 'info');
      else if (threeState === 'failed') setStatus(lastError || '三维沙盘加载失败，已显示平面图。', 'warn', true);
      else retry();
    } else {
      setStatus(null);
    }
    if (three) three._onResize?.();
  }

  let lastError = '';

  async function load3D() {
    if (threeState === 'loading' || threeState === 'ready') return;
    threeState = 'loading';
    setStatus('三维沙盘加载中…（约 4 MB，首次打开稍慢）', 'info');
    try {
      const { Map3D } = await import('./map3d.js');
      const inst = new Map3D(host3d);
      await inst.init({ nodes, roads, onPick });
      three = inst;
      threeState = 'ready';
      if (pendingRoute) three.setRoute(pendingRoute);
      if (pendingHighlight) three.highlight(pendingHighlight);
      if (!userChose2d) setMode('3d');
      else setStatus(null);
    } catch (err) {
      threeState = 'failed';
      lastError = err?.message ?? '三维沙盘加载失败。';
      setStatus(`${lastError} 已保留平面图与文字路线。`, 'warn', true);
      return;
    }
  }

  function retry() {
    if (threeState === 'loading') return;
    if (three) { three.dispose?.(); three = null; }
    host3d.innerHTML = '';
    threeState = 'idle';
    load3D();
  }

  root.querySelector('.map-panel__bar').addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) { setMode(modeBtn.dataset.mode, true); return; }
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) { three?.setView(viewBtn.dataset.view, 600); return; }
    const action = e.target.closest('[data-action]');
    if (action?.dataset.action === 'reset') { three?.setView('iso', 600); three?.highlight(null); }
  });

  return {
    root,
    map2d,
    get mode() { return threeState === 'ready' && !host3d.hidden ? '3d' : '2d'; },
    get threeState() { return threeState; },
    mount(container) {
      if (root.parentElement !== container) container.appendChild(root);
      // 挂载后尺寸才确定，触发一次尺寸校正
      requestAnimationFrame(() => { three?._onResize?.(); });
    },
    setRoute(route) {
      pendingRoute = route;
      map2d.setRoute(route);
      three?.setRoute(route);
    },
    highlight(id) {
      pendingHighlight = id;
      map2d.highlight(id);
      three?.highlight(id);
    },
    focus(id) { three?.focusNode(id); },
    start3D() { load3D(); },
    destroy() {
      three?.dispose?.();
      map2d.destroy();
    },
  };
}
