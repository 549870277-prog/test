/** 轻量 DOM 工具：零依赖，避免引入前端框架 */

/** HTML 转义：所有用户输入（昵称、评论）必须经过它再拼进模板 */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 模板 → 元素（仅接受内部确认过的 HTML 片段） */
export function h(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/** 距离显示：<1000 用米，否则用公里 */
export function fmtDistance(m) {
  const n = Number(m) || 0;
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(2)} km`;
}

/** 分钟 → “1 小时 20 分钟” */
export function fmtMinutes(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  if (n < 60) return `${n} 分钟`;
  const hh = Math.floor(n / 60);
  const mm = n % 60;
  return mm ? `${hh} 小时 ${mm} 分钟` : `${hh} 小时`;
}

/** 时间戳 → 相对时间 */
export function fmtRelative(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let toastTimer = null;
export function toast(message, kind = 'info', ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('<div id="toast" class="toast"></div>');
    document.body.appendChild(el);
  }
  el.className = `toast toast--${kind} is-visible`;
  el.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('is-visible'); }, ms);
}

/** 带错误映射的操作包装：避免每个按钮都写一遍 try/catch */
export async function guard(fn, { onError } = {}) {
  try {
    return await fn();
  } catch (err) {
    const msg = err?.message ?? '操作失败，请重试。';
    if (onError) onError(err, msg); else toast(msg, 'error');
    return null;
  }
}
