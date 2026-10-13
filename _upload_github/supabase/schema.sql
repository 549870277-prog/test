-- ============================================================================
-- 东湖旅游导览系统 · Supabase 数据库结构
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件 → Run
--       然后执行 supabase/seed.sql 导入节点与道路种子数据
-- 说明：本文件可重复执行（幂等）。RLS 默认拒绝，仅显式放行必要操作。
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 公共工具：读取请求头中的访客标识（由前端在每个请求注入 x-visitor-id）
-- 用途：让「游客只能删除本人评论/点赞」可以在数据库层强制校验，
--       而不是只靠前端自觉。验证失败时返回空串，所有写操作随即被 RLS 拒绝。
-- ---------------------------------------------------------------------------
create or replace function public.current_visitor_id()
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::jsonb) ->> 'x-visitor-id',
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- 1) 节点表：入口 / 路口 / 景点
-- ---------------------------------------------------------------------------
create table if not exists public.nodes (
  node_id           text primary key,
  name              text not null,
  type              text not null check (type in ('entry', 'junction', 'poi')),
  lat               double precision,
  lng               double precision,
  x_m               double precision,          -- 示意平面坐标（米，X 向东）
  y_m               double precision,          -- 示意平面坐标（米，Y 向北）
  "desc"            text,
  duration_min      integer not null default 0 check (duration_min >= 0),
  cover_img         text,
  sort_order        integer not null default 0,
  coordinate_status text default 'schematic_not_measured',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.nodes is '游览节点：入口、关键路口、景点。坐标与简介上线前须核实替换。';

-- ---------------------------------------------------------------------------
-- 2) 道路表：只存「已核实的可步行道路」，非直接连通则不建行（等价于 ∞）
-- ---------------------------------------------------------------------------
create table if not exists public.edges (
  id         text primary key,
  from_node  text not null references public.nodes (node_id) on update cascade on delete cascade,
  to_node    text not null references public.nodes (node_id) on update cascade on delete cascade,
  length_m   numeric not null check (length_m > 0),
  width_m    numeric,
  polyline   jsonb not null default '[]'::jsonb,   -- [[x,y], ...] 米坐标折线
  surveyed   boolean not null default false,
  created_at timestamptz not null default now(),
  constraint edges_no_self_loop check (from_node <> to_node)
);

comment on table public.edges is '可步行道路；距离为已录入的道路长度，禁止用直线距离代替。';

create index if not exists edges_from_idx on public.edges (from_node);
create index if not exists edges_to_idx on public.edges (to_node);

-- ---------------------------------------------------------------------------
-- 3) 点赞表：同一访客对同一景点只能保留一个赞
-- ---------------------------------------------------------------------------
create table if not exists public.likes (
  id         uuid primary key default gen_random_uuid(),
  node_id    text not null references public.nodes (node_id) on update cascade on delete cascade,
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  created_at timestamptz not null default now(),
  unique (node_id, visitor_id)
);

create index if not exists likes_node_idx on public.likes (node_id);
create index if not exists likes_visitor_idx on public.likes (visitor_id);

-- ---------------------------------------------------------------------------
-- 4) 评论表：纯文字，1~200 字，昵称可选默认「游客」
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  node_id    text not null references public.nodes (node_id) on update cascade on delete cascade,
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  nickname   text not null default '游客',
  content    text not null check (char_length(btrim(content)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists comments_node_time_idx on public.comments (node_id, created_at desc);
create index if not exists comments_visitor_idx on public.comments (visitor_id);

-- 昵称清洗：去首尾空格，空则回落「游客」，最长 20 字
create or replace function public.cleanup_comment()
returns trigger
language plpgsql
as $$
begin
  new.nickname := coalesce(nullif(btrim(new.nickname), ''), '游客');
  new.nickname := left(new.nickname, 20);
  new.content := btrim(new.content);
  return new;
end;
$$;

drop trigger if exists trg_comment_cleanup on public.comments;
create trigger trg_comment_cleanup
  before insert or update on public.comments
  for each row execute function public.cleanup_comment();

-- 频率限制：单个访客每 10 秒最多发布一条评论
-- 注意：先校验内容长度，内容不合法时不应提示「发布太频繁」
create or replace function public.enforce_comment_rate()
returns trigger
language plpgsql
as $$
begin
  new.content := btrim(new.content);
  if char_length(new.content) < 1 or char_length(new.content) > 200 then
    raise exception 'INVALID_CONTENT: 评论长度需为 1–200 字' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.comments c
    where c.visitor_id = new.visitor_id
      and c.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'RATE_LIMITED: 同一访客每 10 秒最多发布一条评论' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_comment_rate on public.comments;
create trigger trg_comment_rate
  before insert on public.comments
  for each row execute function public.enforce_comment_rate();

-- ---------------------------------------------------------------------------
-- 5) 统计视图：点赞数 / 评论数（前端一次查询即可拿到全部计数）
-- ---------------------------------------------------------------------------
drop view if exists public.node_stats;
create view public.node_stats
with (security_invoker = true)
as
select
  n.node_id,
  n.type,
  (select count(*) from public.likes    l where l.node_id = n.node_id) as like_count,
  (select count(*) from public.comments c where c.node_id = n.node_id) as comment_count
from public.nodes n;

-- 更新 updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_nodes_touch on public.nodes;
create trigger trg_nodes_touch
  before update on public.nodes
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 6) 行级安全策略（RLS）
--    原则：默认关闭，只放行「匿名可读 + 本人可写自己的点赞/评论」
-- ============================================================================
alter table public.nodes    enable row level security;
alter table public.edges    enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- 基础数据：所有人可读
drop policy if exists nodes_read on public.nodes;
create policy nodes_read on public.nodes for select to anon, authenticated using (true);

drop policy if exists edges_read on public.edges;
create policy edges_read on public.edges for select to anon, authenticated using (true);

-- 点赞
drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select to anon, authenticated using (true);

drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to anon, authenticated
  with check (visitor_id = public.current_visitor_id());

drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to anon, authenticated
  using (visitor_id = public.current_visitor_id());

-- 评论
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to anon, authenticated using (true);

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to anon, authenticated
  with check (
    visitor_id = public.current_visitor_id()
    and char_length(btrim(content)) between 1 and 200
  );

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to anon, authenticated
  using (visitor_id = public.current_visitor_id());

-- 数据修复入口（维护人员）：如需人工删除不当内容，请在 SQL Editor 用
-- service_role 连接执行：delete from public.comments where id = '...';

-- ============================================================================
-- 7) 实时能力（可选）：把 comments / likes 加入实时发布
--    前端订阅后，另一个标签页发布的评论会即时出现（PRD 未强制，默认关闭）
--    如需开启，在控制台 Database → Replication 勾选 comments 与 likes 即可。
-- ============================================================================
