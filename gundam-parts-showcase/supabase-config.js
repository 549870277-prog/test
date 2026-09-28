// Publishable key 可安全放在前端；service_role 密钥绝不能出现在网页或 GitHub 中。
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://mynmwfktlgjzgnplbdik.supabase.co',
  'sb_publishable_hSGRVTPupifToanC2daCUg_W4nRP6cQ'
);

// 与 Supabase models 表中的 slug 一致。以后展示另一台模型时改此值即可。
export const modelSlug = 'winged-mecha';
