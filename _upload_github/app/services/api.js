/**
 * 数据访问层（唯一与后端/存储交互的地方）
 *
 * 双通道设计：
 *   cloud —— Supabase（Postgres + PostgREST + RLS），启动时探活；
 *   local —— localStorage，仅在云端未配置或不可用时兜底，保证站点开箱可用。
 * 上层视图只调用本模块方法，不关心当前是哪个通道。
 *
 * 错误处理约定：所有方法要么返回正常数据，要么抛出带 message 的错误对象，
 * 由视图层映射为可读提示；本模块不弹窗、不操作 DOM。
 */
import { CONFIG, isSupabaseConfigured } from '../config.js';
import { NODES as SEED_NODES, ROADS as SEED_ROADS } from '../data/seed.js';

const LS = {
  likes: 'dh:likes:v1',
  comments: 'dh:comments:v1',
  visitor: 'dh:visitor:v1',
};

const readLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeLS = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** 把各类底层错误翻译成游客能看懂的话 */
export function mapError(err) {
  if (!err) return new Error('未知错误，请重试。');
  const msg = String(err.message ?? err);
  const code = String(err.code ?? '');

  if (msg.includes('RATE_LIMITED')) return Object.assign(new Error('发布太频繁了，请 10 秒后再试。'), { code: 'RATE_LIMITED' });
  if (msg.includes('INVALID_CONTENT')) return Object.assign(new Error('评论长度需为 1–200 字。'), { code: 'INVALID' });
  if (code === '23505' || msg.includes('duplicate key')) return Object.assign(new Error('你已经赞过这个景点了。'), { code: 'DUPLICATE' });
  if (code === '42P01' || msg.includes('does not exist')) return Object.assign(new Error('数据表尚未创建，请先在 Supabase 执行 supabase/schema.sql。'), { code: 'NO_TABLE' });
  if (code === '42501' || msg.includes('row-level security')) return Object.assign(new Error('没有权限执行该操作，请刷新页面后重试。'), { code: 'RLS' });
  if (code === '23514' || msg.includes('check constraint')) return Object.assign(new Error('内容不符合要求（评论 1–200 字）。'), { code: 'INVALID' });
  if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Object.assign(new Error('当前处于离线状态，已切换到本地存储。'), { code: 'OFFLINE' });
    }
    return Object.assign(new Error('网络连接失败，请检查网络后重试。'), { code: 'NETWORK' });
  }
  return Object.assign(new Error(`操作失败：${msg}`), { code: code || 'UNKNOWN' });
}

/** 匿名访客标识：同一浏览器稳定，清空浏览器数据后失效（PRD 明确不保证跨设备一致） */
export function getVisitorId() {
  let id = readLS(LS.visitor, null);
  if (typeof id === 'string' && id.length >= 8) return id;
  const gen = (globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
  id = gen.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
  writeLS(LS.visitor, id);
  return id;
}

// ---------------------------------------------------------------------------
// 本地通道实现
// ---------------------------------------------------------------------------
function createLocalStore() {
  const visitorId = getVisitorId();

  const localStats = () => {
    const likes = readLS(LS.likes, {});
    const comments = readLS(LS.comments, []);
    const out = {};
    for (const n of SEED_NODES) {
      out[n.node_id] = {
        node_id: n.node_id,
        like_count: (likes[n.node_id] ?? []).length,
        comment_count: comments.filter((c) => c.node_id === n.node_id).length,
      };
    }
    return out;
  };

  return {
    mode: 'local',
    visitorId,
    async getNodes() { return SEED_NODES; },
    async getRoads() { return SEED_ROADS; },
    async getStats() { return localStats(); },
    async getMyLikes() {
      const likes = readLS(LS.likes, {});
      return new Set(Object.keys(likes).filter((k) => (likes[k] ?? []).includes(visitorId)));
    },
    async setLike(nodeId, liked) {
      const likes = readLS(LS.likes, {});
      const arr = new Set(likes[nodeId] ?? []);
      if (liked) arr.add(visitorId); else arr.delete(visitorId);
      likes[nodeId] = [...arr];
      if (!writeLS(LS.likes, likes)) throw Object.assign(new Error('本地存储写入失败（可能为隐私模式）。'), { code: 'QUOTA' });
      return localStats();
    },
    async listComments(nodeId) {
      return readLS(LS.comments, [])
        .filter((c) => c.node_id === nodeId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    async addComment({ nodeId, nickname, content }) {
      // 先校验内容，再判频率：内容本身不合法时不应提示「发得太频繁」
      const text = String(content ?? '').trim();
      if (!text || text.length > 200) {
        throw Object.assign(new Error('评论长度需为 1–200 字。'), { code: 'INVALID' });
      }
      const comments = readLS(LS.comments, []);
      const last = comments.filter((c) => c.visitor_id === visitorId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (last && Date.now() - new Date(last.created_at).getTime() < CONFIG.COMMENT_COOLDOWN_MS) {
        throw Object.assign(new Error('发布太频繁了，请 10 秒后再试。'), { code: 'RATE_LIMITED' });
      }
      const row = {
        id: (globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}`),
        node_id: nodeId,
        visitor_id: visitorId,
        nickname: (nickname ?? '').trim().slice(0, 20) || '游客',
        content: text,
        created_at: new Date().toISOString(),
      };
      comments.push(row);
      if (!writeLS(LS.comments, comments)) throw Object.assign(new Error('本地存储写入失败（可能为隐私模式）。'), { code: 'QUOTA' });
      return row;
    },
    async deleteComment(id) {
      const comments = readLS(LS.comments, []);
      const target = comments.find((c) => c.id === id);
      if (!target) throw Object.assign(new Error('评论不存在或已被删除。'), { code: 'NOT_FOUND' });
      if (target.visitor_id !== visitorId) throw Object.assign(new Error('只能删除本人发布的评论。'), { code: 'FORBIDDEN' });
      writeLS(LS.comments, comments.filter((c) => c.id !== id));
      return true;
    },
    async health() { return { mode: 'local', ok: true, detail: '本地演示模式：点赞与评论保存在本浏览器' }; },
  };
}

// ---------------------------------------------------------------------------
// 云端通道实现（Supabase）
// ---------------------------------------------------------------------------
function createCloudStore(client, visitorId) {
  const T = CONFIG.TABLES;

  return {
    mode: 'cloud',
    visitorId,
    async getNodes() {
      const { data, error } = await client.from(T.nodes).select('*').order('sort_order', { ascending: true });
      if (error) throw mapError(error);
      if (!data?.length) return SEED_NODES;
      return data.map((n) => ({ ...n, kind_label: n.type === 'poi' ? '景点' : n.type === 'entry' ? '入口' : '路口' }));
    },
    async getRoads() {
      const { data, error } = await client.from(T.edges).select('*');
      if (error) throw mapError(error);
      if (!data?.length) return SEED_ROADS;
      return data.map((r) => ({
        ...r,
        edge_id: r.id,
        course: Number(r.width_m) >= 3 ? '主步道' : '支路',
        polyline: Array.isArray(r.polyline) ? r.polyline : [],
      }));
    },
    async getStats() {
      const { data, error } = await client.from(T.stats).select('*');
      if (error) throw mapError(error);
      const out = {};
      for (const row of data ?? []) out[row.node_id] = { ...row, like_count: Number(row.like_count), comment_count: Number(row.comment_count) };
      return out;
    },
    async getMyLikes() {
      const { data, error } = await client.from(T.likes).select('node_id').eq('visitor_id', visitorId);
      if (error) throw mapError(error);
      return new Set((data ?? []).map((r) => r.node_id));
    },
    async setLike(nodeId, liked) {
      if (liked) {
        const { error } = await client.from(T.likes).insert({ node_id: nodeId, visitor_id: visitorId });
        // 唯一约束冲突说明本次点赞此前已落库，属正常情况，不视为失败
        if (error && error.code !== '23505' && !String(error.message).includes('duplicate')) throw mapError(error);
      } else {
        const { error } = await client.from(T.likes).delete().eq('node_id', nodeId).eq('visitor_id', visitorId);
        if (error) throw mapError(error);
      }
      return this.getStats();
    },
    async listComments(nodeId) {
      const { data, error } = await client.from(T.comments)
        .select('id,node_id,visitor_id,nickname,content,created_at')
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw mapError(error);
      return data ?? [];
    },
    async addComment({ nodeId, nickname, content }) {
      const { data, error } = await client.from(T.comments)
        .insert({ node_id: nodeId, visitor_id: visitorId, nickname: (nickname ?? '').trim() || '游客', content: String(content ?? '').trim() })
        .select()
        .single();
      if (error) throw mapError(error);
      return data;
    },
    async deleteComment(id) {
      const { error } = await client.from(T.comments).delete().eq('id', id).eq('visitor_id', visitorId);
      if (error) throw mapError(error);
      return true;
    },
    async health() {
      const { error } = await client.from(T.nodes).select('node_id').limit(1);
      if (error) throw mapError(error);
      return { mode: 'cloud', ok: true, detail: '已连接 Supabase，数据云端同步' };
    },
  };
}

/**
 * 建立数据通道。启动时先探活云端，失败则回退本地。
 * @returns {Promise<{ store: object, health: object, notice: string|null }>}
 */
export async function createStore() {
  const fallback = () => {
    const store = createLocalStore();
    return { store, health: { mode: 'local', ok: true, detail: '本地演示模式：点赞与评论保存在本浏览器' }, notice: '未配置 Supabase 或云端不可用，已切换到本地演示模式（点赞与评论仅保存在本浏览器）。' };
  };

  if (!isSupabaseConfigured()) return fallback();

  const lib = globalThis.supabase;
  if (!lib?.createClient) {
    if (CONFIG.ALLOW_LOCAL_FALLBACK) return fallback();
    throw new Error('Supabase 客户端未加载。');
  }

  const visitorId = getVisitorId();
  let client;
  try {
    client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { [CONFIG.VISITOR_HEADER]: visitorId } },
    });
  } catch (e) {
    if (CONFIG.ALLOW_LOCAL_FALLBACK) return fallback();
    throw mapError(e);
  }

  const cloud = createCloudStore(client, visitorId);
  try {
    const health = await cloud.health();
    return { store: cloud, health, notice: null, client };
  } catch (e) {
    if (!CONFIG.ALLOW_LOCAL_FALLBACK) throw mapError(e);
    const fb = fallback();
    fb.notice = `Supabase 连接失败（${mapError(e).message}），已切换到本地演示模式。`;
    return fb;
  }
}
