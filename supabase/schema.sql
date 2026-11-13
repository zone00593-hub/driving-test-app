-- 汽車筆試練習網站：資料表、權限與函式
-- 用法：Supabase 後台 → SQL Editor → 貼上整份 → Run。可以重複執行。
--
-- 安全模型：前端只拿得到公開的 anon key，所有保護都靠 Row Level Security——
-- 每個人只能讀寫 user_id 等於自己的列。沒有任何一列是別人看得到的。

-- ───────────────────────── 練習進度：每人每題一列 ─────────────────────────
create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  qno        smallint    not null check (qno between 1 and 2000),
  score      smallint    not null check (score between 0 and 2),
  seen       integer     not null default 0 check (seen >= 0),
  wrong      integer     not null default 0 check (wrong >= 0 and wrong <= seen),
  updated_at timestamptz not null,
  primary key (user_id, qno)
);

-- ───────────────────────── 模擬考紀錄：只新增，不修改 ─────────────────────────
create table if not exists public.exam_attempts (
  id         uuid        primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null,
  total      smallint    not null check (total between 1 and 200),
  wrong      smallint    not null check (wrong between 0 and total),
  seconds    integer     not null check (seconds >= 0),
  passed     boolean     not null,
  wrong_qnos smallint[]  not null default '{}'
);
create index if not exists exam_attempts_user_idx on public.exam_attempts (user_id, created_at);

-- ───────────────────────── 每日作答題數（連續天數用） ─────────────────────────
create table if not exists public.activity (
  user_id  uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  day      date    not null,
  answered integer not null check (answered >= 0),
  primary key (user_id, day)
);

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.progress      enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.activity      enable row level security;

-- 用 (select auth.uid()) 讓資料庫每個查詢只算一次，而不是每一列算一次。
drop policy if exists "progress: 讀自己的" on public.progress;
drop policy if exists "progress: 新增自己的" on public.progress;
drop policy if exists "progress: 修改自己的" on public.progress;
drop policy if exists "progress: 刪除自己的" on public.progress;
create policy "progress: 讀自己的"   on public.progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: 新增自己的" on public.progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress: 修改自己的" on public.progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "progress: 刪除自己的" on public.progress for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "attempts: 讀自己的" on public.exam_attempts;
drop policy if exists "attempts: 新增自己的" on public.exam_attempts;
drop policy if exists "attempts: 修改自己的" on public.exam_attempts;
drop policy if exists "attempts: 刪除自己的" on public.exam_attempts;
create policy "attempts: 讀自己的"   on public.exam_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "attempts: 新增自己的" on public.exam_attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "attempts: 修改自己的" on public.exam_attempts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "attempts: 刪除自己的" on public.exam_attempts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "activity: 讀自己的" on public.activity;
drop policy if exists "activity: 新增自己的" on public.activity;
drop policy if exists "activity: 修改自己的" on public.activity;
drop policy if exists "activity: 刪除自己的" on public.activity;
create policy "activity: 讀自己的"   on public.activity for select to authenticated using ((select auth.uid()) = user_id);
create policy "activity: 新增自己的" on public.activity for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "activity: 修改自己的" on public.activity for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "activity: 刪除自己的" on public.activity for delete to authenticated using ((select auth.uid()) = user_id);

-- 未登入的訪客（anon）完全碰不到這些表。
revoke all on public.progress, public.exam_attempts, public.activity from anon;
grant select, insert, update, delete on public.progress, public.exam_attempts, public.activity to authenticated;

-- ───────────────────────── 合併規則放在資料庫，前端出錯也不會弄壞資料 ─────────────────────────

-- 進度：時間戳較舊的更新直接略過（Last-Writer-Wins）。
-- 兩台裝置同時上傳時，不論誰先到，留下來的都是使用者較晚作答的那一筆。
create or replace function public.progress_keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 裝置時鐘若快得離譜，改用伺服器時間，避免一筆「未來」的資料永遠蓋不掉。
  if new.updated_at > now() + interval '1 day' then
    new.updated_at := now();
  end if;
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- 略過這一列的更新
  end if;
  return new;
end;
$$;

drop trigger if exists progress_keep_newer on public.progress;
create trigger progress_keep_newer
before insert or update on public.progress
for each row execute function public.progress_keep_newer();

-- 每日題數：兩台裝置各自累計，取較大值。
create or replace function public.activity_keep_max()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.answered := greatest(new.answered, old.answered);
  return new;
end;
$$;

drop trigger if exists activity_keep_max on public.activity;
create trigger activity_keep_max
before update on public.activity
for each row execute function public.activity_keep_max();

-- ───────────────────────── 刪除帳號 ─────────────────────────
-- 前端沒有權限刪 auth.users，所以用一個 security definer 函式，
-- 而且只會刪「呼叫者自己」。其餘資料靠上面的 on delete cascade 一併刪除。
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception '尚未登入';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
