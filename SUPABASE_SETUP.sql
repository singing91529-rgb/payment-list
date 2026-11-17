-- Payment Hub Phase 4: shared activity history and least-privilege grants
-- Run this in Supabase SQL Editor after the initial payment_methods/payment_admins setup.

grant usage on schema public to anon, authenticated;
grant select on public.payment_methods to anon, authenticated;
grant insert, update, delete on public.payment_methods to authenticated;
grant select on public.payment_admins to authenticated;

create table if not exists public.payment_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null,
  item_name text not null,
  created_at timestamptz not null default now()
);

alter table public.payment_activity enable row level security;

drop policy if exists "Admins can read payment activity" on public.payment_activity;
create policy "Admins can read payment activity"
on public.payment_activity for select to authenticated
using (exists (select 1 from public.payment_admins where user_id = auth.uid()));

drop policy if exists "Admins can write payment activity" on public.payment_activity;
create policy "Admins can write payment activity"
on public.payment_activity for insert to authenticated
with check (exists (select 1 from public.payment_admins where user_id = auth.uid()));

drop policy if exists "Admins can delete payment activity" on public.payment_activity;
create policy "Admins can delete payment activity"
on public.payment_activity for delete to authenticated
using (exists (select 1 from public.payment_admins where user_id = auth.uid()));

grant select, insert, delete on public.payment_activity to authenticated;

-- Public buckets serve images through their public object URL.
-- A broad SELECT policy on storage.objects is not needed for public object reads,
-- and can allow clients to list the bucket contents.
drop policy if exists "Public can view payment QR" on storage.objects;
