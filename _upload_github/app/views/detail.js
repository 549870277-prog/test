/** 景点详情页：图文介绍、点赞、评论、加入路线（PRD 4.2 / 3.1 / 3.3 / 3.4） */
import { h, esc, fmtMinutes, fmtRelative, toast, $ } from '../ui/dom.js';

export function createDetailView(app) {
  const root = h('<div class="view view--detail"></div>');
  let currentId = null;

  async function render(nodeId) {
    currentId = nodeId;
    const node = app.state.nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      root.innerHTML = '<div class="panel"><p class="empty">未找到该地点。<button class="btn btn--primary" data-act="back">返回</button></p></div>';
      root.querySelector('[data-act="back"]').addEventListener('click', () => app.navigate('#/home'));
      return;
    }

    const st = app.state.stats[node.node_id] ?? { like_count: 0, comment_count: 0 };
    const liked = app.state.myLikes.has(node.node_id);
    const inRoute = app.state.route.sightIds.includes(node.node_id);
    const connects = app.connectsOf(node.node_id);

    root.innerHTML = `
      <div class="detail-hero">
        <img src="${esc(node.cover_img)}" alt="${esc(node.name)} 封面">
        <button class="btn-back" data-act="back" aria-label="返回">‹ 返回</button>
        <span class="detail-hero__tag">${esc(node.kind_label ?? '景点')}</span>
      </div>
      <section class="panel">
        <h2 class="detail-title">${esc(node.name)}</h2>
        <div class="chips">
          ${node.type === 'poi' ? `<span class="chip">建议游览 ${fmtMinutes(node.duration_min)}</span>` : ''}
          ${connects.length ? `<span class="chip chip--ghost">通往 ${esc(connects.map((c) => c.name).join('、'))}</span>` : ''}
          <span class="chip chip--ghost">编号 ${esc(node.node_id)}</span>
        </div>
        <p class="detail-desc">${esc(node.desc)}</p>
        <p class="detail-geo">
          地图位置：${esc(node.lng?.toFixed(5) ?? '—')}°E / ${esc(node.lat?.toFixed(5) ?? '—')}°N
          <span class="detail-geo__note">示意坐标，非实测点位</span>
        </p>
        <div class="detail-actions">
          <button class="btn btn--primary" data-act="toggle-route">${inRoute ? '从路线移除' : '加入路线'}</button>
          <button class="btn btn--ghost" data-act="map">在地图查看</button>
          <button class="btn btn--like ${liked ? 'is-liked' : ''}" data-act="like" ${liked ? 'aria-pressed="true"' : 'aria-pressed="false"'}>
            <span aria-hidden="true">♥</span> <span data-like-count>${st.like_count}</span>
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">评论</h2>
          <span class="panel__hint" data-comment-count>${st.comment_count} 条</span>
        </div>
        <form class="comment-form" novalidate>
          <div class="field">
            <label for="c-nick">昵称（可留空，默认「游客」）</label>
            <input id="c-nick" name="nickname" type="text" maxlength="20" placeholder="游客" autocomplete="off">
          </div>
          <div class="field">
            <label for="c-content">内容（1–200 字）</label>
            <textarea id="c-content" name="content" rows="3" maxlength="200" placeholder="说说你的游览体验…" required></textarea>
            <span class="field__counter" data-counter>0 / 200</span>
          </div>
          <button class="btn btn--primary btn--block" type="submit" data-act="submit">发布评论</button>
        </form>
        <div class="comment-list" data-comment-list>
          <p class="empty">评论加载中…</p>
        </div>
      </section>
    `;

    root.querySelector('[data-act="back"]').addEventListener('click', () => app.navigate('#/home'));
    root.querySelector('[data-act="map"]').addEventListener('click', () => {
      app.focusNode(node.node_id);
      app.navigate('#/home');
      toast(`已在地图上定位「${node.name}」`, 'info');
    });
    root.querySelector('[data-act="toggle-route"]').addEventListener('click', (e) => {
      app.toggleSight(node.node_id);
      e.currentTarget.textContent = app.state.route.sightIds.includes(node.node_id) ? '从路线移除' : '加入路线';
    });

    // ---- 点赞：乐观更新，失败回滚 ----
    root.querySelector('[data-act="like"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const countEl = btn.querySelector('[data-like-count]');
      const wasLiked = app.state.myLikes.has(node.node_id);
      const before = Number(countEl.textContent) || 0;

      // 先改 UI，给即时反馈
      btn.classList.toggle('is-liked', !wasLiked);
      countEl.textContent = String(Math.max(0, before + (wasLiked ? -1 : 1)));
      const local = app.state.stats[node.node_id] ?? { like_count: 0, comment_count: 0 };
      const snapshot = { ...local, like_count: before };
      app.state.stats[node.node_id] = { ...local, like_count: Math.max(0, before + (wasLiked ? -1 : 1)) };

      try {
        const stats = await app.store.setLike(node.node_id, !wasLiked);
        if (wasLiked) app.state.myLikes.delete(node.node_id); else app.state.myLikes.add(node.node_id);
        if (stats?.[node.node_id]) {
          app.state.stats[node.node_id] = stats[node.node_id];
          countEl.textContent = String(stats[node.node_id].like_count);
        }
        app.onStatsChanged();
      } catch (err) {
        // 回滚
        btn.classList.toggle('is-liked', wasLiked);
        countEl.textContent = String(before);
        app.state.stats[node.node_id] = snapshot;
        toast(err?.message ?? '保存失败，请重试。', 'error');
      }
    });

    // ---- 评论表单 ----
    const form = root.querySelector('.comment-form');
    const counter = root.querySelector('[data-counter]');
    const contentEl = form.querySelector('#c-content');
    contentEl.addEventListener('input', () => { counter.textContent = `${contentEl.value.length} / 200`; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = contentEl.value.trim();
      const nickname = form.querySelector('#c-nick').value.trim();
      if (!content) { toast('评论内容不能为空。', 'warn'); contentEl.focus(); return; }
      if (content.length > 200) { toast('评论最长 200 字。', 'warn'); return; }
      const submitBtn = form.querySelector('[data-act="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = '发布中…';
      try {
        await app.store.addComment({ nodeId: node.node_id, nickname, content });
        contentEl.value = '';
        counter.textContent = '0 / 200';
        await loadComments();
        await app.refreshStats();
        toast('评论已发布', 'ok');
      } catch (err) {
        // 失败保留输入内容，允许直接重试
        toast(err?.message ?? '发布失败，请重试。', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发布评论';
      }
    });

    await loadComments();
  }

  async function loadComments() {
    const listEl = root.querySelector('[data-comment-list]');
    if (!listEl) return;
    listEl.innerHTML = '<p class="empty">评论加载中…</p>';
    let rows = [];
    try {
      rows = await app.store.listComments(currentId);
    } catch (err) {
      listEl.innerHTML = `<p class="empty">评论加载失败：${esc(err?.message ?? '请重试')}
        <button class="btn btn--sm btn--ghost" data-act="reload">重试</button></p>`;
      listEl.querySelector('[data-act="reload"]')?.addEventListener('click', loadComments);
      return;
    }
    const countEl = root.querySelector('[data-comment-count]');
    if (countEl) countEl.textContent = `${rows.length} 条`;
    if (!rows.length) {
      listEl.innerHTML = '<p class="empty">还没有评论，来做第一个分享的人吧。</p>';
      return;
    }
    listEl.innerHTML = '';
    for (const c of rows) {
      const mine = c.visitor_id === app.store.visitorId;
      const item = h(`
        <article class="comment" data-id="${esc(c.id)}">
          <div class="comment__head">
            <span class="comment__nick">${esc(c.nickname || '游客')}</span>
            <span class="comment__time">${esc(fmtRelative(c.created_at))}</span>
          </div>
          <p class="comment__body">${esc(c.content)}</p>
          ${mine ? '<button class="comment__del" data-act="del">删除</button>' : ''}
        </article>
      `);
      if (mine) {
        const del = item.querySelector('[data-act="del"]');
        del.addEventListener('click', async () => {
          // 首次点击进入「确认」态，4 秒后自动复位；再次点击才真正删除
          if (!del.classList.contains('is-confirm')) {
            del.classList.add('is-confirm');
            del.textContent = '确认删除？';
            setTimeout(() => {
              if (del.isConnected) { del.classList.remove('is-confirm'); del.textContent = '删除'; }
            }, 4000);
            return;
          }
          del.disabled = true;
          try {
            await app.store.deleteComment(c.id);
            await loadComments();
            await app.refreshStats();
            toast('评论已删除', 'ok');
          } catch (err) {
            del.disabled = false;
            del.classList.remove('is-confirm');
            del.textContent = '删除';
            toast(err?.message ?? '删除失败，请重试。', 'error');
          }
        });
      }
      listEl.appendChild(item);
    }
  }

  return { root, render, reload: () => (currentId ? loadComments() : null) };
}
