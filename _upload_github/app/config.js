/**
 * 站点配置。此处只放「公开」信息：anon key 本身即设计为可公开（RLS 兜底安全）。
 * 注意：service_role key 绝对不能出现在这里。
 *
 * 填写方法：
 *   Supabase 控制台 → Project Settings → API
 *     Project URL        → SUPABASE_URL
 *     anon public 的 key → SUPABASE_ANON_KEY
 * 留空则站点自动运行在「本地演示模式」：点赞与评论存浏览器本地，其余功能完全可用。
 */
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  TABLES: {
    nodes: 'nodes',
    edges: 'edges',
    likes: 'likes',
    comments: 'comments',
    stats: 'node_stats',
  },

  /** 访客标识请求头：数据库端 RLS 依赖它校验「只能改自己的数据」 */
  VISITOR_HEADER: 'x-visitor-id',

  /** 评论冷却时间（毫秒），与数据库 enforce_comment_rate 保持一致 */
  COMMENT_COOLDOWN_MS: 10000,

  /** 云端不可用时是否回退到本地存储（true 才能保证「给个链接就能看」） */
  ALLOW_LOCAL_FALLBACK: true,

  /** 模型与地图 */
  MODEL: {
    url: './public/tingtao.glb',
    scale: 500,          // 1:500，米 → 模型单位
    markerHeight: 0.006, // 标记点高度（模型单位）
    routeHeight: 0.035,  // 路线抬高，避免与路面共面闪烁
  },
};

/** 是否已填入有效的 Supabase 配置 */
export function isSupabaseConfigured() {
  const u = CONFIG.SUPABASE_URL;
  const k = CONFIG.SUPABASE_ANON_KEY;
  return Boolean(u && k && /^https?:\/\//.test(u) && !u.includes('xxxx') && k.length > 20);
}
