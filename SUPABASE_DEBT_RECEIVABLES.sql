-- Payment Hub：新增「別人欠我的」管理資料表。請在 Supabase SQL Editor 執行一次。
create table if not exists public.debt_receivables (
  id uuid primary key default gen_random_uuid(),
  person_name text not null check (char_length(person_name) between 1 and 80),
  subject text not null check (char_length(subject) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0 and amount <= 99999999),
  borrowed_at date not null default current_date,
  due_date date null,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debt_receivables_due_after_borrowed check (due_date is null or due_date >= borrowed_at)
);

alter table public.debt_receivables enable row level security;
revoke all on public.debt_receivables from anon, authenticated;
grant select, insert, update, delete on public.debt_receivables to authenticated;
drop policy if exists "debt receivables admin select" on public.debt_receivables;
drop policy if exists "debt receivables admin insert" on public.debt_receivables;
drop policy if exists "debt receivables admin update" on public.debt_receivables;
drop policy if exists "debt receivables admin delete" on public.debt_receivables;
create policy "debt receivables admin select" on public.debt_receivables for select to authenticated using (public.is_payment_admin());
create policy "debt receivables admin insert" on public.debt_receivables for insert to authenticated with check (public.is_payment_admin());
create policy "debt receivables admin update" on public.debt_receivables for update to authenticated using (public.is_payment_admin()) with check (public.is_payment_admin());
create policy "debt receivables admin delete" on public.debt_receivables for delete to authenticated using (public.is_payment_admin());
